// @vitest-environment jsdom
// StreamStatusBanner — the monitor pages' connection banner.
// Three banner states (hidden / disconnected / rejected) plus the rate-limit
// hint, the rejected retry button (fan-out to the store's reconnect handles),
// and the recovery transition (banner disappears when streams re-open).
// The store is driven by hand via registerStream sinks — the full socket →
// store → banner chain is covered by the useCoreCWebSocket tests.
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamStatusBanner } from '@/components/layout/StreamStatusBanner'
import i18n from '@/i18n'
import { deriveAggregate, useWsStatusStore } from '@/stores/wsStatusStore'

// React 19: RTL only flips the act switch during render(); this file also
// drives store updates through act() before the first render.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const store = () => useWsStatusStore.getState()

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  store().reset()
})

afterEach(() => {
  cleanup()
  store().reset()
})

function registerStream(id: string) {
  return store().registerStream(id)
}

describe('StreamStatusBanner', () => {
  it('renders nothing while every stream is healthy', () => {
    const sink = registerStream('healthy')
    act(() => sink('open'))
    const { container } = render(<StreamStatusBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing during the initial handshake (never-failed connecting)', () => {
    registerStream('fresh')
    const { container } = render(<StreamStatusBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the disconnected banner with the last-update time while reconnecting', () => {
    const sink = registerStream('flaky')
    act(() => sink('open'))
    act(() => sink('closed'))
    render(<StreamStatusBanner />)

    // Audit copy (en): "⚠ Live stream disconnected — data may be stale
    // (last update {{time}}). Reconnecting…"
    const time = new Date(store().streams.flaky.lastActivityAt).toLocaleTimeString()
    expect(
      screen.getByText(
        `⚠ Live stream disconnected — data may be stale (last update ${time}). Reconnecting…`,
      ),
    ).toBeTruthy()
    // No retry button in the auto-reconnect state.
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the rejected banner with a retry button that reconnects rejected streams', () => {
    const sink = registerStream('given-up')
    const reconnect = vi.fn()
    store().attachReconnect('given-up', reconnect)
    act(() => sink('rejected'))
    render(<StreamStatusBanner />)

    // Audit copy (en) for the gave-up state.
    expect(
      screen.getByText(
        'Live stream gave up after 10 failed attempts. Check your network and reload the page.',
      ),
    ).toBeTruthy()
    expect(deriveAggregate(store().streams)).toBe('rejected')

    // The rejected state has an in-band recovery entry: the banner's
    // Reconnect button fans out to the stream's reconnect handle.
    const button = screen.getByRole('button', { name: /reconnect/i })
    act(() => button.click())
    expect(reconnect).toHaveBeenCalledTimes(1)
  })

  it('hides the banner when the stream recovers (rejected → retry → open)', () => {
    const sink = registerStream('recovered')
    act(() => sink('rejected'))
    const { container } = render(<StreamStatusBanner />)
    expect(container).not.toBeEmptyDOMElement()

    act(() => {
      sink('connecting') // manual retry in flight — still down
    })
    expect(container).not.toBeEmptyDOMElement()

    act(() => {
      sink('open') // recovered — banner disappears by itself
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the rate-limit hint while frames are being dropped, then clears it on transition', () => {
    const sink = registerStream('flooded')
    act(() => sink('open'))
    render(<StreamStatusBanner />)

    act(() => store().reportDropped('flooded', 12))
    expect(
      screen.getByText(
        '⚠ Live data exceeds the 500 msg/s UI protection cap — some updates are being dropped to keep the interface responsive',
      ),
    ).toBeTruthy()

    // A connection transition clears the stale hint (drops require a live flow).
    act(() => sink('closed'))
    expect(
      screen.queryByText(
        '⚠ Live data exceeds the 500 msg/s UI protection cap — some updates are being dropped to keep the interface responsive',
      ),
    ).toBeNull()
  })
})
