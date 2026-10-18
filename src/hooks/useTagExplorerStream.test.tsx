// @vitest-environment jsdom
// useTagExplorerStream (B08) — on trend RESUME after a pause, a value-less
// gap sample must be appended after the last real sample so the chart breaks
// the line across the paused period. The WebSocket class is stubbed; the
// hook's real state machinery (rAF batching, refs, seeding) runs for real.
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTagExplorerStream } from '@/hooks/useTagExplorerStream'

vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    destroy = vi.fn()
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
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
