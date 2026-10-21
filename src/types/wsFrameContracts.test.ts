import { describe, expect, it } from 'vitest'

import {
  logEventSchema,
  parseLogLevel,
  trafficFrameSchema,
  trafficRateFrameSchema,
  trafficTotalsFrameSchema,
} from '@/types/api'

// ─── Audit F1: /logs level contract ──────────────────────────────────────
// The backend marshals slog.Level as a STRING ("WARN" — verified by
// compiling json.Marshal against the Go source); the frontend contract
// is numeric. These tests pin the normalization so the silent breakage
// (alert feed dead, every line tagged [INFO]) can never regress.

describe('logEventSchema — backend string levels normalize to the numeric contract', () => {
  const frame = {
    type: 'engine.read',
    payload: 'read 42 points',
    timestamp: '2026-10-21T12:00:00Z',
  }

  it.each([
    ['DEBUG', -8],
    ['INFO', 0],
    ['WARN', 4],
    ['ERROR', 8],
  ])('marshals "%s" → %d', (level, expected) => {
    const parsed = logEventSchema.safeParse({ ...frame, level })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.level).toBe(expected)
  })

  it('normalizes custom severities ("ERROR+2" → 10) the way slog renders them', () => {
    const parsed = logEventSchema.safeParse({ ...frame, level: 'ERROR+2' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.level).toBe(10)
  })

  it('passes legacy numeric levels through unchanged (mocks/older backends)', () => {
    const parsed = logEventSchema.safeParse({ ...frame, level: 4 })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.level).toBe(4)
  })

  it('drops frames with unparseable levels (boundary discipline)', () => {
    expect(logEventSchema.safeParse({ ...frame, level: 'not-a-level' }).success).toBe(false)
    expect(logEventSchema.safeParse({ ...frame, level: null }).success).toBe(false)
  })
})

describe('parseLogLevel — severity classification used by alert feed + terminal', () => {
  it('WARN normalizes to the warning threshold (>= 4 passes)', () => {
    expect(parseLogLevel('WARN')).toBeGreaterThanOrEqual(4)
    expect(parseLogLevel('WARN')).toBeLessThan(8)
  })
  it('ERROR normalizes to the error threshold (>= 8 passes)', () => {
    expect(parseLogLevel('ERROR')).toBeGreaterThanOrEqual(8)
  })
})

// ─── Audit F2: /traffic frame contract ───────────────────────────────────
// The backend's default mode pushes server-side diffed rate frames; the
// old cumulative-only schema dropped 100% of them (panel stuck on
// "waiting"). The union now accepts both modes.

describe('trafficFrameSchema — both modes validate (audit F2)', () => {
  it('accepts the default rate frame', () => {
    const rate = { read_rate: 125, publish_rate: 124, dropped_rate: 0 }
    expect(trafficRateFrameSchema.safeParse(rate).success).toBe(true)
    const parsed = trafficFrameSchema.safeParse(rate)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect('read_rate' in parsed.data).toBe(true)
  })

  it('accepts the legacy totals frame (?mode=totals)', () => {
    const totals = { read: 45000, publish: 44997, dropped: 3 }
    expect(trafficTotalsFrameSchema.safeParse(totals).success).toBe(true)
    expect(trafficFrameSchema.safeParse(totals).success).toBe(true)
  })

  it('rejects malformed frames (boundary discipline)', () => {
    expect(trafficFrameSchema.safeParse({ read_rate: 'fast' }).success).toBe(false)
    expect(trafficFrameSchema.safeParse({}).success).toBe(false)
  })
})
