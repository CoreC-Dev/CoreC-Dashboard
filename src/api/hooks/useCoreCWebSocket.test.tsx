// @vitest-environment jsdom
// useCoreCWebSocket — WS lifecycle + global status-store wiring.
// The WebSocket class is mocked with a controllable stub (same pattern as
// RealtimeStreamsPanel.test.tsx); the REAL hook wiring is under test:
// create on mount / destroy on unmount, ref-stable consumer callbacks, and
// the new wsStatusStore integration (status sink, activity touch, drop
// reports, reconnect handle, detach on unmount).
import { cleanup, renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCoreCWebSocket } from '@/api/hooks'
import type { WSStatus } from '@/api/websocket'
import { deriveAggregate, useWsStatusStore } from '@/stores/wsStatusStore'

// React 19: RTL only flips the act switch during render(); this file also
// drives store updates through act() before the first render.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type WsMessageHandler = (data: unknown) => void
type WsStatusHandler = (status: WSStatus) => void
type WsDropHandler = (dropped: number) => void

interface MockSocket {
  path: string
  onMessage: WsMessageHandler
  onStatus: WsStatusHandler
  onDrop: WsDropHandler
  reconnect: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const sockets: MockSocket[] = []

vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    path: string
    onMessage: WsMessageHandler
    onStatus: WsStatusHandler
    onDrop: WsDropHandler
    reconnect = vi.fn()
    destroy = vi.fn()
    constructor(
      path: string,
      _params: Record<string, string>,
      onMessage: WsMessageHandler,
      onStatus?: WsStatusHandler,
      onDrop?: WsDropHandler,
    ) {
      this.path = path
      this.onMessage = onMessage
      this.onStatus = onStatus ?? (() => {})
      this.onDrop = onDrop ?? (() => {})
      sockets.push(this)
    }
  },
}))

const store = () => useWsStatusStore.getState()

beforeEach(() => {
  store().reset()
})

afterEach(() => {
  cleanup()
  sockets.length = 0
  store().reset()
})

describe('useCoreCWebSocket — lifecycle', () => {
  it('creates the socket on mount and destroys it on unmount', () => {
    const { unmount } = renderHook(() => useCoreCWebSocket('/traffic', { interval: '1s' }, vi.fn()))

    expect(sockets).toHaveLength(1)
    expect(sockets[0].path).toBe('/traffic')

    unmount()
    expect(sockets[0].destroy).toHaveBeenCalledTimes(1)
  })

  it('resubscribes when the path changes and cleans up the old stream entry', () => {
    const { rerender, unmount } = renderHook(
      ({ path }: { path: string }) => useCoreCWebSocket(path, {}, vi.fn()),
      { initialProps: { path: '/traffic' } },
    )

    rerender({ path: '/memory' })
    expect(sockets).toHaveLength(2)
    // Only the new stream remains registered.
    expect(Object.keys(store().streams)).toHaveLength(1)

    unmount()
    expect(Object.keys(store().streams)).toHaveLength(0)
  })

  it('delivers messages to the consumer callback', () => {
    const onMessage = vi.fn()
    renderHook(() => useCoreCWebSocket('/memory', {}, onMessage))

    act(() => sockets[0].onMessage({ goroutines: 42 }))
    expect(onMessage).toHaveBeenCalledWith({ goroutines: 42 })
  })

  it('chains consumer onStatus after the store sink', () => {
    const onStatus = vi.fn()
    renderHook(() => useCoreCWebSocket('/traffic', {}, vi.fn(), onStatus))

    act(() => sockets[0].onStatus('open'))
    expect(onStatus).toHaveBeenCalledWith('open')
    expect(deriveAggregate(store().streams)).toBe('open')
  })
})

describe('useCoreCWebSocket — wsStatusStore wiring', () => {
  it('registers the stream as connecting on mount and derives the aggregate from socket status', () => {
    expect(deriveAggregate(store().streams)).toBe('idle')

    renderHook(() => useCoreCWebSocket('/traffic', {}, vi.fn()))
    expect(deriveAggregate(store().streams)).toBe('connecting')

    act(() => sockets[0].onStatus('open'))
    expect(deriveAggregate(store().streams)).toBe('open')

    // A drop mid-stream keeps the aggregate healthy but arms the hint.
    act(() => sockets[0].onDrop(7))
    const entry = Object.values(store().streams)[0]
    expect(entry?.recentDropped).toBe(7)
  })

  it('forwards activity pings from delivered messages (throttled ≥1s in the store)', () => {
    vi.useFakeTimers()
    try {
      renderHook(() => useCoreCWebSocket('/traffic', {}, vi.fn()))
      const before = Object.values(store().streams)[0]?.lastActivityAt

      act(() => {
        vi.advanceTimersByTime(2000)
        sockets[0].onMessage({ read: 1 })
      })
      const after = Object.values(store().streams)[0]?.lastActivityAt
      expect(after).toBeGreaterThan(before ?? 0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('detaches the stream from the store on unmount', () => {
    const { unmount } = renderHook(() => useCoreCWebSocket('/memory', {}, vi.fn()))
    act(() => sockets[0].onStatus('rejected'))
    expect(deriveAggregate(store().streams)).toBe('rejected')

    unmount()
    expect(deriveAggregate(store().streams)).toBe('idle')
  })

  it('wires a reconnect handle so retryRejectedStreams reaches the rejected socket', () => {
    const { unmount } = renderHook(() => useCoreCWebSocket('/memory', {}, vi.fn()))
    act(() => sockets[0].onStatus('rejected'))

    act(() => store().retryRejectedStreams())
    expect(sockets[0].reconnect).toHaveBeenCalledTimes(1)

    unmount()
  })
})
