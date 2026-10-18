import { describe, expect, it } from 'vitest'
import { deriveTopologyView } from '@/features/home/instanceTopology'
import type { CoreCInstance } from '@/types/models'

type InstanceStats = NonNullable<NonNullable<CoreCInstance['lastKnownInfo']>['stats']>

/** Minimal stats snapshot with only the fields deriveTopologyView reads. */
function stats(overrides: Partial<InstanceStats> = {}): InstanceStats {
  return {
    drivers: 0,
    transports: 0,
    rules: 0,
    total_read: 0,
    total_publish: 0,
    total_errors: 0,
    total_dropped: 0,
    points_per_sec: 0,
    ...overrides,
  }
}

describe('deriveTopologyView (extracted from InstanceCard unchanged)', () => {
  it('returns an empty view for undefined stats', () => {
    const view = deriveTopologyView(undefined)
    expect(view.allInputs).toEqual([])
    expect(view.allOutputs).toEqual([])
    expect(view.ruleList).toEqual([])
    expect(view.hasTopology).toBe(false)
  })

  it('classifies transports by counters: incoming, outgoing, bidirectional', () => {
    const view = deriveTopologyView(
      stats({
        transport_stats: {
          mqtt_in: {
            name: 'mqtt_in',
            type: 'mqtt',
            state: 1,
            published: 0,
            received: 10,
            failed: 0,
          },
          mqtt_out: {
            name: 'mqtt_out',
            type: 'mqtt',
            state: 1,
            published: 10,
            received: 0,
            failed: 0,
          },
          both: { name: 'both', type: 'http', state: 1, published: 3, received: 4, failed: 0 },
        },
      }),
    )

    expect(view.allInputs.map((r) => r.name)).toEqual(['mqtt_in', 'both'])
    expect(view.allOutputs.map((r) => r.name)).toEqual(['mqtt_out', 'both'])
    // Bidirectional appears on both sides with its per-side detail.
    expect(view.allInputs.find((r) => r.name === 'both')?.detail).toBe('4 rx')
    expect(view.allOutputs.find((r) => r.name === 'both')?.detail).toBe('3 pub')
    expect(view.hasTopology).toBe(true)
  })

  it('uses the name heuristic for ambiguous transports with zero counters', () => {
    const view = deriveTopologyView(
      stats({
        transport_stats: {
          sub_source: {
            name: 'sub_source',
            type: 'kafka',
            state: 1,
            published: 0,
            received: 0,
            failed: 0,
          },
          webhook_out: {
            name: 'webhook_out',
            type: 'http',
            state: 1,
            published: 0,
            received: 0,
            failed: 0,
          },
        },
      }),
    )

    // /sub|in|from/ heuristic → sub_source is an input, webhook_out an
    // output. (Fixture names deliberately avoid accidental matches like
    // "pla*in*", which the regex would classify as an input.)
    expect(view.allInputs.map((r) => r.name)).toEqual(['sub_source'])
    expect(view.allOutputs.map((r) => r.name)).toEqual(['webhook_out'])
  })

  it('maps drivers to input rows with error/tag detail and conn summary', () => {
    const view = deriveTopologyView(
      stats({
        driver_stats: {
          plc: {
            name: 'plc',
            type: 'modbus',
            state: 2,
            tag_count: 12,
            read_count: 99,
            error_count: 0,
          },
          bad: { name: 'bad', type: 's7', state: 3, tag_count: 0, read_count: 0, error_count: 4 },
        },
        driver_conn: { plc: '192.168.1.10:502' },
      }),
    )

    expect(view.allInputs).toHaveLength(2)
    const plc = view.allInputs.find((r) => r.name === 'plc')
    expect(plc?.detail).toBe('12 tags')
    expect(plc?.conn).toBe('192.168.1.10:502')
    expect(plc?.isDriver).toBe(true)
    const bad = view.allInputs.find((r) => r.name === 'bad')
    expect(bad?.detail).toBe('4 err')
  })

  it('passes the rule list through and flags topology presence', () => {
    const rules = [
      { name: 'r1', match: '*', action: 'forward', target: 't', disabled: false, hit_count: 7 },
    ]
    const view = deriveTopologyView(stats({ rule_list: rules }))
    expect(view.ruleList).toEqual(rules)
    expect(view.hasTopology).toBe(true)
  })
})
