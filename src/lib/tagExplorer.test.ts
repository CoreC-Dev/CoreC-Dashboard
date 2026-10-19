// Pure-logic tests for the tag explorer lib (B07 quality/stale filter; the
// page's filteredTags memo and these tests share the exact same predicate —
// plus B08's pause-gap helper and B15's relative timestamps).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendTrendSamples,
  formatRelativeTime,
  insertPauseGap,
  MAX_TREND_SAMPLES,
  matchesQualityFilter,
  type QualityFilter,
  type Translate,
} from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

const pt = (quality: number, is_stale?: boolean): Pick<DataPoint, 'quality' | 'is_stale'> => ({
  quality,
  is_stale,
})

describe('matchesQualityFilter (B07)', () => {
  it("'all' with no stale toggle keeps every point", () => {
    expect(matchesQualityFilter(pt(0), 'all', false)).toBe(true)
    expect(matchesQualityFilter(pt(1), 'all', false)).toBe(true)
    expect(matchesQualityFilter(pt(2), 'all', false)).toBe(true)
  })

  it('narrows to the selected quality code (0=good, 1=bad, 2=uncertain)', () => {
    expect(matchesQualityFilter(pt(0), 'good' as QualityFilter, false)).toBe(true)
    expect(matchesQualityFilter(pt(1), 'good' as QualityFilter, false)).toBe(false)
    expect(matchesQualityFilter(pt(1), 'bad' as QualityFilter, false)).toBe(true)
    expect(matchesQualityFilter(pt(2), 'bad' as QualityFilter, false)).toBe(false)
    expect(matchesQualityFilter(pt(2), 'uncertain' as QualityFilter, false)).toBe(true)
    expect(matchesQualityFilter(pt(0), 'uncertain' as QualityFilter, false)).toBe(false)
  })

  it('stale-only keeps only points flagged is_stale', () => {
    expect(matchesQualityFilter(pt(0, true), 'all', true)).toBe(true)
    expect(matchesQualityFilter(pt(0, false), 'all', true)).toBe(false)
    // Absent flag counts as not stale (CoreC omits it on fresh points).
    expect(matchesQualityFilter(pt(0), 'all', true)).toBe(false)
  })

  it('combines quality and staleness conjunctively', () => {
    expect(matchesQualityFilter(pt(1, true), 'bad' as QualityFilter, true)).toBe(true)
    expect(matchesQualityFilter(pt(1, false), 'bad' as QualityFilter, true)).toBe(false)
    expect(matchesQualityFilter(pt(0, true), 'bad' as QualityFilter, true)).toBe(false)
  })
})

describe('insertPauseGap (B08)', () => {
  it('appends a value-less gap sample one second after the last real sample', () => {
    const out = insertPauseGap([
      { time: 100, value: 5 },
      { time: 103, value: 6 },
    ])
    expect(out).toEqual([
      { time: 100, value: 5 },
      { time: 103, value: 6 },
      { time: 104 }, // no value → whitespace: the line breaks here
    ])
  })

  it('is a no-op on an empty buffer (nothing to break yet)', () => {
    expect(insertPauseGap([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [{ time: 50, value: 1 }]
    insertPauseGap(input)
    expect(input).toEqual([{ time: 50, value: 1 }])
  })
})

describe('formatRelativeTime (B15)', () => {
  // Pin the clock — under a loaded shared CI tree the test's Date.now()
  // and the helper's Date.now() could straddle a second boundary and flip
  // the expected title/age (A-domain flake report). Frozen now ⇒ the
  // helper reads the exact instant these expectations compute.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T08:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // Fake t: renders the key plus the count so assertions are locale-free.
  const t: Translate = (key, opts) => `${key}${opts?.count ?? ''}`
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

  it('sub-minute timestamps read "just now" and stay fully opaque', () => {
    const out = formatRelativeTime(ago(30_000), t)
    expect(out.text).toBe('common.justNow')
    expect(out.dim).toBe(false)
    expect(out.full).toBe(new Date(ago(30_000)).toLocaleString())
  })

  it('1–4 minutes render minutesAgo but are not dimmed yet (5-min horizon)', () => {
    const out = formatRelativeTime(ago(3 * 60_000), t)
    expect(out.text).toBe('common.minutesAgo3')
    expect(out.dim).toBe(false)
  })

  it('past 5 minutes the timestamp dims (the stale value stops looking live)', () => {
    const out = formatRelativeTime(ago(10 * 60_000), t)
    expect(out.text).toBe('common.minutesAgo10')
    expect(out.dim).toBe(true)
  })

  it('hours and days use their own keys and always dim', () => {
    expect(formatRelativeTime(ago(3 * 3_600_000), t)).toEqual({
      text: 'common.hoursAgo3',
      full: new Date(ago(3 * 3_600_000)).toLocaleString(),
      dim: true,
    })
    const twoDays = formatRelativeTime(ago(2 * 86_400_000), t)
    expect(twoDays.text).toBe('common.daysAgo2')
    expect(twoDays.dim).toBe(true)
  })

  it('a missing timestamp is the most suspect: "-" and dimmed', () => {
    expect(formatRelativeTime(undefined, t)).toEqual({ text: '-', full: '-', dim: true })
  })
})

describe('appendTrendSamples (B21)', () => {
  it('coalesces same-second updates into one sample, keeping the last value', () => {
    const out = appendTrendSamples(
      [{ time: 100, value: 1 }],
      [
        { time: 101, value: 2 },
        { time: 101, value: 3 },
        { time: 101, value: 4 },
      ],
    )
    expect(out).toEqual([
      { time: 100, value: 1 },
      { time: 101, value: 4 }, // one sample at the REAL second, last value
    ])
  })

  it('coalesces onto the previous buffer tail too (rAF frame boundary)', () => {
    const out = appendTrendSamples([{ time: 200, value: 5 }], [{ time: 200, value: 9 }])
    expect(out).toEqual([{ time: 200, value: 9 }])
  })

  it('drops out-of-order samples instead of fabricating a later timestamp', () => {
    const out = appendTrendSamples(
      [{ time: 300, value: 1 }],
      [
        { time: 299, value: 0 },
        { time: 301, value: 2 },
      ],
    )
    expect(out).toEqual([
      { time: 300, value: 1 },
      { time: 301, value: 2 }, // 299 vanished — never re-dated to 300+1
    ])
  })

  it('a valued sample landing on a pause-gap marker overwrites it (sub-second pause)', () => {
    const out = appendTrendSamples(
      [
        { time: 400, value: 1 },
        { time: 401 }, // B08 gap marker
      ],
      [{ time: 401, value: 2 }],
    )
    expect(out).toEqual([
      { time: 400, value: 1 },
      { time: 401, value: 2 },
    ])
  })

  it('keeps the sliding window trimmed to MAX_TREND_SAMPLES', () => {
    const staged = Array.from({ length: MAX_TREND_SAMPLES + 10 }, (_, i) => ({
      time: 1000 + i,
      value: i,
    }))
    const out = appendTrendSamples([], staged)
    expect(out).toHaveLength(MAX_TREND_SAMPLES)
    expect(out[0]).toEqual({ time: 1010, value: 10 }) // oldest trimmed
  })
})
