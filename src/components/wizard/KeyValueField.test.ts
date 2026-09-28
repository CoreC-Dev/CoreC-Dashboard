import { describe, expect, it } from 'vitest'
import { toRecord } from './KeyValueField'

describe('KeyValueField toRecord', () => {
  it('converts plain object to Record<string,string>', () => {
    const result = toRecord({ Authorization: 'Bearer xxx', 'X-Custom': 'abc' })
    expect(result).toEqual({ Authorization: 'Bearer xxx', 'X-Custom': 'abc' })
  })

  it('filters out empty keys', () => {
    const result = toRecord({ '': 'value', valid: 'ok' })
    expect(result).toEqual({ valid: 'ok' })
  })

  it('stringifies non-string values', () => {
    const result = toRecord({ count: 42, flag: true })
    expect(result).toEqual({ count: '42', flag: 'true' })
  })

  it('returns empty object for null', () => {
    expect(toRecord(null)).toEqual({})
  })

  it('returns empty object for undefined', () => {
    expect(toRecord(undefined)).toEqual({})
  })

  it('returns empty object for arrays', () => {
    expect(toRecord([1, 2, 3])).toEqual({})
  })

  it('returns empty object for primitives', () => {
    expect(toRecord('string')).toEqual({})
    expect(toRecord(42)).toEqual({})
  })
})
