import { describe, expect, it } from 'vitest'
import {
  computeConfigDiff,
  computeLineDiff,
} from '@/components/wizard/ConfigApplyConfirmationDialog'

describe('computeConfigDiff', () => {
  it('returns zero changes when before and after are identical', () => {
    const config = {
      drivers: [{ name: 'd1' }],
      transports: [{ name: 't1' }],
      rules: [{ name: 'r1' }],
      global: { 'log-level': 'info' },
      node: { id: 'edge-A' },
    }
    const diff = computeConfigDiff(config, config)
    expect(diff.totalChanges).toBe(0)
    expect(diff.drivers.added).toBe(0)
    expect(diff.drivers.removed).toBe(0)
    expect(diff.global).toBe(false)
    expect(diff.node).toBe(false)
  })

  it('detects added drivers', () => {
    const before = { drivers: [{ name: 'd1' }] }
    const after = { drivers: [{ name: 'd1' }, { name: 'd2' }] }
    const diff = computeConfigDiff(before, after)
    expect(diff.drivers.added).toBe(1)
    expect(diff.drivers.removed).toBe(0)
    expect(diff.totalChanges).toBeGreaterThan(0)
  })

  it('detects removed transports', () => {
    const before = { transports: [{ name: 't1' }, { name: 't2' }] }
    const after = { transports: [{ name: 't1' }] }
    const diff = computeConfigDiff(before, after)
    expect(diff.transports.removed).toBe(1)
  })

  it('detects added and removed simultaneously', () => {
    const before = { rules: [{ name: 'r1' }, { name: 'r2' }] }
    const after = { rules: [{ name: 'r2' }, { name: 'r3' }] }
    const diff = computeConfigDiff(before, after)
    expect(diff.rules.added).toBe(1) // r3
    expect(diff.rules.removed).toBe(1) // r1
    // r2 exists in both and is unchanged → NOT modified
    expect(diff.rules.modified).toBe(0)
  })

  it('detects actual content modifications (not just name presence)', () => {
    const before = {
      drivers: [{ name: 'd1', type: 'modbus-tcp', settings: { host: '1.1.1.1' } }],
    }
    const after = {
      drivers: [{ name: 'd1', type: 'modbus-tcp', settings: { host: '2.2.2.2' } }],
    }
    const diff = computeConfigDiff(before, after)
    expect(diff.drivers.modified).toBe(1)
    expect(diff.drivers.added).toBe(0)
    expect(diff.drivers.removed).toBe(0)
  })

  it('does NOT count identical entities as modified', () => {
    const before = {
      drivers: [{ name: 'd1', type: 'modbus-tcp', settings: { host: '1.1.1.1' } }],
      transports: [{ name: 't1', type: 'mqtt' }],
    }
    const after = {
      drivers: [{ name: 'd1', type: 'modbus-tcp', settings: { host: '1.1.1.1' } }],
      transports: [{ name: 't1', type: 'mqtt' }],
    }
    const diff = computeConfigDiff(before, after)
    expect(diff.drivers.modified).toBe(0)
    expect(diff.transports.modified).toBe(0)
    expect(diff.totalChanges).toBe(0)
  })

  it('detects global config changes', () => {
    const before = { global: { 'log-level': 'info' } }
    const after = { global: { 'log-level': 'debug' } }
    const diff = computeConfigDiff(before, after)
    expect(diff.global).toBe(true)
  })

  it('detects node config changes', () => {
    const before = { node: { id: 'edge-A' } }
    const after = { node: { id: 'edge-B' } }
    const diff = computeConfigDiff(before, after)
    expect(diff.node).toBe(true)
  })

  it('handles null before config (everything is new)', () => {
    const after = { drivers: [{ name: 'd1' }], transports: [{ name: 't1' }] }
    const diff = computeConfigDiff(null, after)
    expect(diff.drivers.added).toBe(1)
    expect(diff.transports.added).toBe(1)
  })

  it('handles both null', () => {
    const diff = computeConfigDiff(null, null)
    expect(diff.totalChanges).toBe(0)
    expect(diff.requiresRestart).toBe(false)
  })

  it('detects rule-providers changes', () => {
    const before = {
      drivers: [{ name: 'd' }],
      transports: [{ name: 't' }],
      'rule-providers': [{ name: 'rp1', type: 'file', path: '/rules.yaml' }],
    }
    const after = {
      drivers: [{ name: 'd' }],
      transports: [{ name: 't' }],
      'rule-providers': [{ name: 'rp2', type: 'file', path: '/rules2.yaml' }],
    }
    const diff = computeConfigDiff(before, after)
    expect(diff['rule-providers']).toBe(true)
    expect(diff.requiresRestart).toBe(true)
  })

  it('detects rule-groups changes', () => {
    const before = {
      drivers: [{ name: 'd' }],
      transports: [{ name: 't' }],
      'rule-groups': { g1: [{ name: 'r', match: 'ALL', action: 'drop' }] },
    }
    const after = {
      drivers: [{ name: 'd' }],
      transports: [{ name: 't' }],
      'rule-groups': { g2: [{ name: 'r', match: 'ALL', action: 'drop' }] },
    }
    const diff = computeConfigDiff(before, after)
    expect(diff['rule-groups']).toBe(true)
    expect(diff.requiresRestart).toBe(true)
  })

  it('sets requiresRestart=true when global changes', () => {
    const before = {
      drivers: [{ name: 'd' }],
      transports: [{ name: 't' }],
      global: { 'log-level': 'info' },
    }
    const after = {
      drivers: [{ name: 'd' }],
      transports: [{ name: 't' }],
      global: { 'log-level': 'debug' },
    }
    const diff = computeConfigDiff(before, after)
    expect(diff.global).toBe(true)
    expect(diff.requiresRestart).toBe(true)
  })

  it('sets requiresRestart=false for driver/transport/rule-only changes', () => {
    const before = {
      drivers: [{ name: 'd', type: 'modbus-tcp' }],
      transports: [{ name: 't' }],
      rules: [{ name: 'r' }],
    }
    const after = {
      drivers: [{ name: 'd', type: 'opcua' }], // same name, different type → modified
      transports: [{ name: 't' }],
      rules: [{ name: 'r' }],
    }
    const diff = computeConfigDiff(before, after)
    expect(diff.drivers.modified).toBe(1)
    expect(diff.requiresRestart).toBe(false)
  })

  it('sets requiresRestart=true when node changes', () => {
    const before = {
      drivers: [{ name: 'd' }],
      transports: [{ name: 't' }],
      node: { id: 'node-1' },
    }
    const after = {
      drivers: [{ name: 'd' }],
      transports: [{ name: 't' }],
      node: { id: 'node-2' },
    }
    const diff = computeConfigDiff(before, after)
    expect(diff.node).toBe(true)
    expect(diff.requiresRestart).toBe(true)
  })
})

describe('computeLineDiff', () => {
  it('returns all "same" for identical strings', () => {
    const diff = computeLineDiff('a\nb\nc', 'a\nb\nc')
    expect(diff.every((l) => l.type === 'same')).toBe(true)
    expect(diff).toHaveLength(3)
  })

  it('detects added lines', () => {
    const diff = computeLineDiff('a\nc', 'a\nb\nc')
    const added = diff.filter((l) => l.type === 'added')
    expect(added).toHaveLength(1)
    expect(added[0].text).toBe('b')
  })

  it('detects removed lines', () => {
    const diff = computeLineDiff('a\nb\nc', 'a\nc')
    const removed = diff.filter((l) => l.type === 'removed')
    expect(removed).toHaveLength(1)
    expect(removed[0].text).toBe('b')
  })

  it('handles empty before string', () => {
    const diff = computeLineDiff('', 'a\nb')
    const added = diff.filter((l) => l.type === 'added')
    expect(added).toHaveLength(2)
  })

  it('handles empty after string', () => {
    const diff = computeLineDiff('a\nb', '')
    const removed = diff.filter((l) => l.type === 'removed')
    expect(removed).toHaveLength(2)
  })

  it('handles both empty strings', () => {
    const diff = computeLineDiff('', '')
    expect(diff).toHaveLength(1) // one empty line
  })

  it('preserves line order for unchanged lines', () => {
    const diff = computeLineDiff('x\na\ny\nb\nz', 'a\nb')
    const same = diff.filter((l) => l.type === 'same').map((l) => l.text)
    expect(same).toEqual(['a', 'b'])
  })

  it('detects modifications as remove+add', () => {
    const diff = computeLineDiff('host: 1.1.1.1', 'host: 2.2.2.2')
    const removed = diff.filter((l) => l.type === 'removed')
    const added = diff.filter((l) => l.type === 'added')
    expect(removed).toHaveLength(1)
    expect(added).toHaveLength(1)
    expect(removed[0].text).toBe('host: 1.1.1.1')
    expect(added[0].text).toBe('host: 2.2.2.2')
  })
})
