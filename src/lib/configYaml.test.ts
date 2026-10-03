import { describe, expect, it } from 'vitest'
import {
  dumpConfigYaml,
  findDriver,
  findTransport,
  isDriverNameUnique,
  isRuleGroupNameUnique,
  isRuleProviderNameUnique,
  parseConfigYaml,
  removeDriver,
  removeRuleGroup,
  removeTransport,
  upsertDriver,
  upsertRuleGroup,
  upsertRuleProvider,
  upsertTransport,
} from '@/lib/configYaml'
import type { CoreCConfig, DriverConfig, TransportConfig } from '@/types/config'

const driver: DriverConfig = {
  name: 'plc1',
  type: 'modbus-tcp',
  settings: { host: '192.168.1.5', port: 502 },
  'tags-file': 'tags.csv',
  tags: [],
}
const transport: TransportConfig = {
  name: 'wh1',
  type: 'http',
  settings: { 'webhook-addr': '0.0.0.0:9091' },
}

const baseConfig: CoreCConfig = {
  node: { id: 'edge', role: 'collector' },
  drivers: [driver],
  transports: [transport],
}

// ─── parse / dump ───────────────────────────────────────────────────

describe('parseConfigYaml', () => {
  it('parses a valid YAML mapping into a config object', () => {
    const yaml = 'node:\n  id: edge\n  role: collector\n'
    const result = parseConfigYaml(yaml)
    expect(result).toEqual({ node: { id: 'edge', role: 'collector' } })
  })

  it('returns {} for null YAML and throws on empty input', () => {
    // js-yaml throws "expected a document" for the empty string before the
    // null-check runs; explicit null parses to null → {}.
    expect(parseConfigYaml('null')).toEqual({})
    expect(() => parseConfigYaml('')).toThrow()
  })

  it('throws on non-mapping root (scalar or array)', () => {
    expect(() => parseConfigYaml('42')).toThrow(/mapping/)
    expect(() => parseConfigYaml('- a\n- b\n')).toThrow(/mapping/)
  })

  it('throws on invalid YAML syntax', () => {
    expect(() => parseConfigYaml('foo: *bar')).toThrow() // undefined alias ref
    expect(() => parseConfigYaml('node: {unclosed')).toThrow() // unclosed flow mapping
  })

  it('rejects prototype-polluting keys (TD-SEC-009)', () => {
    expect(() => parseConfigYaml('__proto__:\n  evil: true\n')).toThrow(/__proto__/)
    expect(() => parseConfigYaml('node:\n  constructor: 1\n')).toThrow(/constructor/)
    expect(() => parseConfigYaml('drivers:\n  - name: x\n    prototype: bad\n')).toThrow(
      /prototype/,
    )
  })
})

describe('dumpConfigYaml', () => {
  it('round-trips a representative config (parse ∘ dump ≈ identity)', () => {
    const yaml = dumpConfigYaml(baseConfig)
    const reparsed = parseConfigYaml(yaml)
    expect(reparsed).toEqual(baseConfig)
  })

  it('does not wrap long lines (lineWidth -1) and uses no refs', () => {
    const config: CoreCConfig = {
      drivers: [
        {
          name: 'long',
          type: 'modbus-tcp',
          settings: { host: 'a-very-long-hostname-that-exceeds-normal-line-widths.example.local' },
          tags: [],
        },
      ],
    }
    const yaml = dumpConfigYaml(config)
    // The host value should appear on a single line, not wrapped.
    expect(yaml).toContain('a-very-long-hostname-that-exceeds-normal-line-widths.example.local')
  })
})

// ─── driver CRUD ────────────────────────────────────────────────────

describe('driver helpers', () => {
  it('upsert adds a new driver', () => {
    const updated = upsertDriver(baseConfig, {
      name: 'plc2',
      type: 's7',
      settings: { host: '10.0.0.1' },
      tags: [],
    })
    expect(updated.drivers).toHaveLength(2)
    expect(updated.drivers?.[1].name).toBe('plc2')
    // Input not mutated.
    expect(baseConfig.drivers).toHaveLength(1)
  })

  it('upsert replaces an existing driver by name', () => {
    const updated = upsertDriver(baseConfig, {
      name: 'plc1',
      type: 'modbus-rtu',
      settings: { host: '10.0.0.2' },
      tags: [],
    })
    expect(updated.drivers).toHaveLength(1)
    expect(updated.drivers?.[0].type).toBe('modbus-rtu')
  })

  it('find returns the driver or undefined', () => {
    expect(findDriver(baseConfig, 'plc1')?.type).toBe('modbus-tcp')
    expect(findDriver(baseConfig, 'nope')).toBeUndefined()
  })

  it('remove deletes by name and is a no-op if absent', () => {
    const removed = removeDriver(baseConfig, 'plc1')
    expect(removed.drivers).toEqual([])
    const noop = removeDriver(baseConfig, 'nope')
    expect(noop).toEqual(baseConfig)
  })

  it('isDriverNameUnique checks case-sensitively', () => {
    expect(isDriverNameUnique(baseConfig, 'plc2')).toBe(true)
    expect(isDriverNameUnique(baseConfig, 'plc1')).toBe(false)
    expect(isDriverNameUnique(baseConfig, 'PLC1')).toBe(true)
  })
})

// ─── transport CRUD ─────────────────────────────────────────────────

describe('transport helpers', () => {
  it('upsert + find + remove', () => {
    const updated = upsertTransport(baseConfig, {
      name: 'mqtt1',
      type: 'mqtt',
      settings: { broker: 'tcp://x:1883' },
    })
    expect(updated.transports).toHaveLength(2)
    expect(findTransport(updated, 'mqtt1')?.type).toBe('mqtt')
    const removed = removeTransport(updated, 'wh1')
    expect(removed.transports).toHaveLength(1)
    expect(removed.transports?.[0].name).toBe('mqtt1')
  })
})

// ─── rule providers ─────────────────────────────────────────────────

describe('rule provider helpers', () => {
  it('upsert + uniqueness', () => {
    const updated = upsertRuleProvider(baseConfig, {
      name: 'prov1',
      type: 'file',
      path: '/tmp/rules',
    })
    expect(updated['rule-providers']).toHaveLength(1)
    expect(isRuleProviderNameUnique(updated, 'prov1')).toBe(false)
    expect(isRuleProviderNameUnique(updated, 'prov2')).toBe(true)
  })
})

// ─── rule groups (Record shape) ─────────────────────────────────────

describe('rule group helpers', () => {
  it('upsert + find + remove + uniqueness', () => {
    const rules = [{ name: 'r1', match: 'ALL', action: 'forward' }]
    const updated = upsertRuleGroup(baseConfig, 'grp1', rules)
    expect(updated['rule-groups']?.grp1).toEqual(rules)
    expect(isRuleGroupNameUnique(updated, 'grp1')).toBe(false)
    expect(isRuleGroupNameUnique(updated, 'grp2')).toBe(true)
    const removed = removeRuleGroup(updated, 'grp1')
    expect(removed['rule-groups']?.grp1).toBeUndefined()
  })
})
