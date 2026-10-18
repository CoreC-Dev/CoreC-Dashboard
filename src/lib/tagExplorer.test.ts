// Pure-logic tests for the tag explorer lib (B07 quality/stale filter; the
// page's filteredTags memo and these tests share the exact same predicate —
// plus B08's pause-gap helper).
import { describe, expect, it } from 'vitest'
import { insertPauseGap, matchesQualityFilter, type QualityFilter } from '@/lib/tagExplorer'
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
