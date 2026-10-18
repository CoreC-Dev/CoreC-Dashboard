// Unit tests for the pure toLineData mapping (B08) — gap samples become
// whitespace points (no value key) so lightweight-charts breaks the line
// instead of drawing a fabricated segment across the pause period.
import { describe, expect, it, vi } from 'vitest'
import { toLineData } from '@/hooks/useTrendChart'

// useTrendChart imports themeStore, which reads the system theme via
// matchMedia at module scope — jsdom does not implement it.
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

describe('toLineData (B08)', () => {
  it('maps valued samples to time+value points', () => {
    expect(toLineData([{ time: 10, value: 1.5 }])).toEqual([{ time: 10, value: 1.5 }])
  })

  it('maps gap samples to whitespace points without a value key', () => {
    const out = toLineData([{ time: 10, value: 1.5 }, { time: 11 }])
    expect(out).toEqual([{ time: 10, value: 1.5 }, { time: 11 }])
    expect('value' in (out[1] as object)).toBe(false)
  })

  it('keeps the sample order verbatim', () => {
    const out = toLineData([{ time: 30 }, { time: 31, value: 2 }, { time: 35 }])
    expect(out.map((p) => p.time)).toEqual([30, 31, 35])
  })
})
