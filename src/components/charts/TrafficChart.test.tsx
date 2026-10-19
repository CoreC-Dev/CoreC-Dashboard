// @vitest-environment jsdom
// TrafficChart (B20) — the chart must say whether it is waiting for its
// first frame or frozen after a disconnect, instead of silent empty axes /
// a silent freeze. useCoreCWebSocket is mocked so tests can drive the
// onMessage/onStatus callbacks the real socket would invoke. i18n English.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrafficChart } from '@/components/charts/TrafficChart'
import i18n from '@/i18n'
import type { TrafficFrame } from '@/types/models'

// The callbacks the real socket would invoke, captured per mount.
const handlers: {
  message?: (f: TrafficFrame) => void
  status?: (s: string) => void
} = {}
vi.mock('@/api/hooks', () => ({
  useCoreCWebSocket: (
    _path: string,
    _params: Record<string, string>,
    onMessage: (f: TrafficFrame) => void,
    onStatus?: (s: string) => void,
  ) => {
    handlers.message = onMessage
    handlers.status = onStatus
  },
}))

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  handlers.message = undefined
  handlers.status = undefined
})

afterEach(() => {
  cleanup()
})

const frame = (over: Partial<TrafficFrame> = {}): TrafficFrame => ({
  read: 10,
  publish: 5,
  dropped: 0,
  ...over,
})

const driveStatus = (s: string) => {
  act(() => {
    handlers.status?.(s)
  })
}

describe('TrafficChart — status honesty overlay (B20)', () => {
  it('says "Waiting for live data…" while not a single frame has arrived', () => {
    render(<TrafficChart />)

    expect(screen.getByText('Waiting for live data…')).toBeTruthy()
    expect(screen.queryByText('Disconnected — chart updates paused')).toBeNull()
  })

  it('clears the overlay once frames flow', () => {
    render(<TrafficChart />)
    driveStatus('open')
    // First frame is only the delta baseline; the second renders a point.
    act(() => {
      handlers.message?.(frame())
      handlers.message?.(frame({ read: 20 }))
    })

    expect(screen.queryByText('Waiting for live data…')).toBeNull()
  })

  it('announces "updates paused" over the frozen data after a drop', () => {
    render(<TrafficChart />)
    driveStatus('open')
    act(() => {
      handlers.message?.(frame())
      handlers.message?.(frame({ read: 20 }))
    })

    driveStatus('closed')

    expect(screen.getByText('Disconnected — chart updates paused')).toBeTruthy()
  })

  it('clears the disconnected pill once the socket reopens', () => {
    render(<TrafficChart />)
    driveStatus('open')
    act(() => {
      handlers.message?.(frame())
      handlers.message?.(frame({ read: 20 }))
    })
    driveStatus('closed')
    expect(screen.getByText('Disconnected — chart updates paused')).toBeTruthy()

    driveStatus('open')

    expect(screen.queryByText('Disconnected — chart updates paused')).toBeNull()
  })
})
