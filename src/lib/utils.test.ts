import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/cn'
import { formatNumber, formatUptime, isZeroTime } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('deduplicates conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })
})

describe('formatUptime', () => {
  it('parses Go duration strings (CoreC /.uptime returns a duration string)', () => {
    expect(formatUptime('4h30m')).toBe('4h 30m')
    expect(formatUptime('1h30m45.123s')).toBe('1h 30m')
    expect(formatUptime('25m40.650422s')).toBe('25m 40s')
    expect(formatUptime('5s')).toBe('5s')
    expect(formatUptime('0s')).toBe('')
    expect(formatUptime('')).toBe('')
  })

  it('converts nanoseconds to human-readable format', () => {
    // 90061 seconds = 1ns * 90061 * 1e9
    const ns = 90061 * 1e9
    expect(formatUptime(ns)).toBe('1d 1h 1m 1s')
  })

  it('shows seconds only for short durations', () => {
    expect(formatUptime(45 * 1e9)).toBe('45s')
  })

  it('shows minutes and seconds', () => {
    expect(formatUptime(125 * 1e9)).toBe('2m 5s')
  })

  it('handles zero', () => {
    expect(formatUptime(0)).toBe('0s')
  })
})

describe('formatNumber', () => {
  it('formats large numbers with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('handles negative numbers', () => {
    expect(formatNumber(-1234)).toBe('-1,234')
  })
})

describe('isZeroTime', () => {
  it('detects Go zero time "0001-01-01T00:00:00Z"', () => {
    expect(isZeroTime('0001-01-01T00:00:00Z')).toBe(true)
  })

  it('detects Unix epoch "1970-01-01T00:00:00Z"', () => {
    expect(isZeroTime('1970-01-01T00:00:00Z')).toBe(true)
  })

  it('detects timezone-shifted epoch "1970-01-01T08:00:00+08:00"', () => {
    // This is the actual format CoreC emits for rule hit_at/miss_at
    expect(isZeroTime('1970-01-01T08:00:00+08:00')).toBe(true)
  })

  it('returns true for null/undefined/empty', () => {
    expect(isZeroTime(null)).toBe(true)
    expect(isZeroTime(undefined)).toBe(true)
    expect(isZeroTime('')).toBe(true)
  })

  it('returns false for valid timestamps', () => {
    expect(isZeroTime('2024-01-15T10:30:00Z')).toBe(false)
    expect(isZeroTime('2024-06-01T08:00:00+08:00')).toBe(false)
  })

  it('returns false for timestamps after epoch', () => {
    // Any real timestamp will be well after 1970-01-01; the startsWith
    // check intentionally treats the entire epoch day as zero-time
    // because CoreC only emits 1970-01-01 for the Unix epoch (hit_at/miss_at).
    expect(isZeroTime('1970-01-02T00:00:00Z')).toBe(false)
    expect(isZeroTime('2024-01-01T00:00:01Z')).toBe(false)
  })
})
