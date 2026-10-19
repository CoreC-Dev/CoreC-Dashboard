// @vitest-environment jsdom
// MemoryChart (B20) — same honesty overlay contract as TrafficChart: the
// first frame clears "waiting", an involuntary drop pins "updates paused"
// over the frozen data. useCoreCWebSocket is mocked for callback capture.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryChart } from '@/components/charts/MemoryChart'
import i18n from '@/i18n'
import type { MemoryFrame } from '@/types/models'

const handlers: {
  message?: (f: MemoryFrame) => void
  status?: (s: string) => void
} = {}
vi.mock('@/api/hooks', () => ({
  useCoreCWebSocket: (
    _path: string,
    _params: Record<string, string>,
    onMessage: (f: MemoryFrame) => void,
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

const frame = (over: Partial<MemoryFrame> = {}): MemoryFrame => ({
  alloc: 20 * 1024 * 1024,
  sys: 64 * 1024 * 1024,
  goroutines: 42,
  ...over,
})

const driveStatus = (s: string) => {
  act(() => {
    handlers.status?.(s)
  })
}

describe('MemoryChart — status honesty overlay (B20)', () => {
  it('says "Waiting for live data…" before the first frame', () => {
    render(<MemoryChart />)

    expect(screen.getByText('Waiting for live data…')).toBeTruthy()
  })

  it('clears the overlay after the first frame and pauses on a drop', () => {
    render(<MemoryChart />)
    driveStatus('open')
    act(() => {
      handlers.message?.(frame())
    })
    expect(screen.queryByText('Waiting for live data…')).toBeNull()

    driveStatus('error')

    expect(screen.getByText('Disconnected — chart updates paused')).toBeTruthy()
  })
})
