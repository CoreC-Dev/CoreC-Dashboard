import { describe, expect, it } from 'vitest'
import {
  evaluateClause,
  evaluateMatch,
  getFieldValue,
  type SimDataPoint,
} from '@/lib/ruleMatchEvaluator'

const dp: SimDataPoint = {
  driver: 'plc1',
  device: 'devA',
  group: 'grp1',
  tag: 'temperature',
  value: '95.5',
  type: 'float32',
  quality: 'good',
}

describe('getFieldValue', () => {
  it('returns each known field', () => {
    expect(getFieldValue(dp, 'driver')).toBe('plc1')
    expect(getFieldValue(dp, 'tag')).toBe('temperature')
    expect(getFieldValue(dp, 'value')).toBe('95.5')
    expect(getFieldValue(dp, 'quality')).toBe('good')
  })

  it('returns undefined for unknown fields', () => {
    expect(getFieldValue(dp, 'unknown')).toBeUndefined()
  })
})

describe('evaluateClause', () => {
  it('empty clause matches (true)', () => {
    expect(evaluateClause('', dp)).toBe(true)
    expect(evaluateClause('   ', dp)).toBe(true)
  })

  it('string equality (==) and inequality (!=)', () => {
    expect(evaluateClause('tag == "temperature"', dp)).toBe(true)
    expect(evaluateClause('tag == "pressure"', dp)).toBe(false)
    expect(evaluateClause('tag != "pressure"', dp)).toBe(true)
  })

  it('numeric comparisons', () => {
    expect(evaluateClause('value > 90', dp)).toBe(true)
    expect(evaluateClause('value > 100', dp)).toBe(false)
    expect(evaluateClause('value >= 95.5', dp)).toBe(true)
    expect(evaluateClause('value <= 95.5', dp)).toBe(true)
    expect(evaluateClause('value < 90', dp)).toBe(false)
  })

  it('numeric comparison with NaN field returns false', () => {
    expect(evaluateClause('tag > 90', dp)).toBe(false) // tag is non-numeric
  })

  it('contains operator', () => {
    expect(evaluateClause('tag contains "temp"', dp)).toBe(true)
    expect(evaluateClause('tag contains "press"', dp)).toBe(false)
  })

  it('bare field name (truthy check)', () => {
    expect(evaluateClause('driver', dp)).toBe(true)
    expect(evaluateClause('tag', dp)).toBe(true)
  })

  it('bare field with empty value is falsy', () => {
    const emptyDp = { ...dp, group: '' }
    expect(evaluateClause('group', emptyDp)).toBe(false)
  })

  it('unknown field in comparison returns false', () => {
    expect(evaluateClause('unknown > 5', dp)).toBe(false)
    expect(evaluateClause('unknown == "x"', dp)).toBe(false)
  })

  it('unparseable clause returns false', () => {
    expect(evaluateClause('!!!', dp)).toBe(false)
    expect(evaluateClause('tag >> 5', dp)).toBe(false)
  })
})

describe('evaluateMatch', () => {
  it('ALL (empty match) is true', () => {
    expect(evaluateMatch('ALL', dp)).toBe(false) // "ALL" is a bare field → no field named ALL → false
    expect(evaluateMatch('', dp)).toBe(true)
    expect(evaluateMatch('  ', dp)).toBe(true)
  })

  it('single clause', () => {
    expect(evaluateMatch('value > 90', dp)).toBe(true)
    expect(evaluateMatch('value > 100', dp)).toBe(false)
  })

  it('AND conjunction (&&)', () => {
    expect(evaluateMatch('tag == "temperature" && value > 90', dp)).toBe(true)
    expect(evaluateMatch('tag == "temperature" && value > 100', dp)).toBe(false)
  })

  it('OR disjunction (||)', () => {
    expect(evaluateMatch('value > 100 || tag == "temperature"', dp)).toBe(true)
    expect(evaluateMatch('value > 100 || tag == "pressure"', dp)).toBe(false)
  })

  it('mixed && and || (&& binds tighter)', () => {
    // (tag == "pressure" && value > 90) || (tag == "temperature")
    // = false || true = true
    expect(evaluateMatch('tag == "pressure" && value > 90 || tag == "temperature"', dp)).toBe(true)
    // (tag == "temperature" && value > 100) || (tag == "pressure")
    // = false || false = false
    expect(evaluateMatch('tag == "temperature" && value > 100 || tag == "pressure"', dp)).toBe(
      false,
    )
  })
})
