// @vitest-environment jsdom
// useTagExplorerStream (B08/B21) — on trend RESUME after a pause, a
// value-less gap sample must be appended after the last real sample so the
// chart breaks the line across the paused period; on the live path,
// same-second WS updates must coalesce into one sample instead of being
// re-dated +1s. The WebSocket class is stubbed with its constructor args
// recorded; the hook's real state machinery (rAF batching, refs, seeding)
// runs for real.
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTagExplorerStream } from '@/hooks/useTagExplorerStream'
import type { DataPoint } from '@/types/models'

const socketArgs: unknown[][] = []
vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    constructor(...args: unknown[]) {
      socketArgs.push(args)
    }
    destroy = vi.fn()
  },
}))

const TREND_POINT: DataPoint = {
  driver: 'plc1',
  device: 'meter-01',
  tag: 'temperature',
  value: 0,
  type: 'float32',
  quality: 0,
  timestamp: '2026-01-01T12:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  socketArgs.length = 0
})

afterEach(() => {
  cleanup()
})

function renderStream() {
  return renderHook(() => useTagExplorerStream({ initialTags: undefined, selectedDriver: 'all' }))
}

describe('useTagExplorerStream — pause gap on resume (B08)', () => {
  it('stages a value-less gap sample one second after the last real sample on resume', () => {
    const { result } = renderStream()

    act(() => {
      result.current.setTrendSamples([
        { time: 100, value: 5 },
        { time: 103, value: 6 },
      ])
    })
    act(() => {
      result.current.setTrendPaused(true)
    })
    // Pausing alone must NOT alter the buffer.
    expect(result.current.trendSamples).toEqual([
      { time: 100, value: 5 },
      { time: 103, value: 6 },
    ])

    act(() => {
      result.current.setTrendPaused(false)
    })

    expect(result.current.trendSamples).toEqual([
      { time: 100, value: 5 },
      { time: 103, value: 6 },
      { time: 104 }, // whitespace gap: no value
    ])
  })

  it('inserts no gap when resuming with an empty trend buffer', () => {
    const { result } = renderStream()

    act(() => {
      result.current.setTrendPaused(true)
    })
    act(() => {
      result.current.setTrendPaused(false)
    })

    expect(result.current.trendSamples).toEqual([])
  })

  it('each pause→resume cycle adds exactly one gap marker', () => {
    const { result } = renderStream()

    act(() => {
      result.current.setTrendSamples([{ time: 10, value: 1 }])
    })
    // Two full pause→resume cycles → two gap markers, each appended after
    // the then-last sample.
    for (const paused of [true, false, true, false]) {
      act(() => {
        result.current.setTrendPaused(paused)
      })
    }

    expect(result.current.trendSamples).toEqual([
      { time: 10, value: 1 },
      { time: 11 },
      { time: 12 },
    ])
  })
})

describe('useTagExplorerStream — same-second coalescing (B21)', () => {
  it('merges same-second WS samples into one point instead of re-dating them +1s', async () => {
    const { result } = renderStream()

    act(() => {
      result.current.setTrendTag(TREND_POINT)
    })
    // The socket's onMessage is the 3rd constructor argument.
    const onMessage = socketArgs[0]?.[2] as (p: DataPoint) => void
    const sec = (ms: number) => new Date(Date.parse('2026-01-01T12:00:00Z') + ms).toISOString()
    act(() => {
      // Three updates inside the SAME second, then one in the next.
      onMessage({ ...TREND_POINT, value: 1, timestamp: sec(100) })
      onMessage({ ...TREND_POINT, value: 2, timestamp: sec(400) })
      onMessage({ ...TREND_POINT, value: 3, timestamp: sec(700) })
      onMessage({ ...TREND_POINT, value: 4, timestamp: sec(1_000) })
    })

    // The rAF flush lands asynchronously in jsdom — poll for it.
    await vi.waitFor(() => {
      expect(result.current.trendSamples.length).toBeGreaterThan(0)
    })
    const base = Math.floor(Date.parse('2026-01-01T12:00:00Z') / 1000)
    expect(result.current.trendSamples).toEqual([
      { time: base, value: 3 }, // coalesced: last value at the REAL second
      { time: base + 1, value: 4 }, // no fabricated +1s drift between them
    ])
  })
})
