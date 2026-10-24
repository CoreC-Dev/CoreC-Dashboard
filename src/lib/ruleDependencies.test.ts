import { describe, expect, it } from 'vitest'
import { rulesDependingOnDriver, unionRulesForDependencyScan } from '@/lib/ruleDependencies'
import type { CoreCConfig, RuleConfig } from '@/types/config'

const PLC1 = { name: 'plc1', tags: [{ name: 'temperature' }, { name: 'pump_status' }] }
const PLC2 = { name: 'plc2', tags: [{ name: 'temperature' }] }
const ALL = [PLC1, PLC2]

const rule = (name: string, match: string): RuleConfig => ({
  name,
  match,
  action: 'forward',
  priority: 100,
  target: 'mqtt-out',
})

const scan = (match: string, driver = PLC1, all = ALL, groups?: Record<string, RuleConfig[]>) =>
  rulesDependingOnDriver({
    driver,
    allDrivers: all,
    rules: [rule('r', match)],
    groups,
  })

describe('rulesDependingOnDriver', () => {
  it('flags exact driver equality clauses', () => {
    expect(scan('driver == "plc1"')).toHaveLength(1)
    expect(scan('value > 80 && driver == "plc1"')).toHaveLength(1)
  })

  it('flags contains clauses with substring semantics', () => {
    expect(scan('driver contains "plc"')).toHaveLength(1)
    expect(scan('driver contains "line3"')).toHaveLength(0)
  })

  it('flags regex clauses, evaluating the pattern', () => {
    expect(scan('driver =~ /plc.*/')).toHaveLength(1)
    expect(scan('driver =~ /^s7.*/')).toHaveLength(0)
    // An uncompilable regex must warn, not stay silent.
    expect(scan('driver =~ /plc(*/')).toHaveLength(1)
  })

  it('does not flag inequality or bare-driver clauses', () => {
    expect(scan('driver != "plc1"')).toHaveLength(0)
    expect(scan('driver')).toHaveLength(0)
    expect(scan('driver && value > 5')).toHaveLength(0)
  })

  it('ignores ALL and empty matches', () => {
    expect(scan('ALL')).toHaveLength(0)
    expect(scan('')).toHaveLength(0)
  })

  it('flags tag clauses for tags owned only by the deleted driver', () => {
    // pump_status is unique to plc1 — the rule consumes its data.
    expect(scan('tag == "pump_status"')).toHaveLength(1)
    // temperature is shared with plc2 — the rule keeps its source.
    expect(scan('tag == "temperature"')).toHaveLength(0)
    expect(scan('tag contains "pump"')).toHaveLength(1)
  })

  it('does not flag tag clauses when another driver owns the tag', () => {
    expect(scan('tag == "temperature"', PLC1, [PLC1, PLC2])).toHaveLength(0)
    expect(scan('tag == "temperature"', PLC1, [PLC1])).toHaveLength(1)
  })

  it('quoted values cannot masquerade as the driver field', () => {
    // The tag named "driver-side" is owned by plc1 — a tag dependency,
    // not a bare driver clause.
    const drv = { name: 'plc1', tags: [{ name: 'driver-side' }] }
    expect(scan('tag == "driver-side"', drv, [drv])).toHaveLength(1)
  })

  it('resolves SUB-RULE groups one level deep', () => {
    const groups = {
      'plc-rules': [rule('sub1', 'driver == "plc1"'), rule('sub2', 'value > 5')],
    }
    expect(scan('SUB-RULE:plc-rules', PLC1, ALL, groups)).toHaveLength(1)
    expect(scan('SUB-RULE:other', PLC1, ALL, groups)).toHaveLength(0)
  })

  it('handles SUB-RULE cycles without hanging', () => {
    const groups = { loop: [rule('sub1', 'SUB-RULE:loop')] }
    expect(scan('SUB-RULE:loop', PLC1, ALL, groups)).toHaveLength(0)
  })

  it('skips RULE-SET references (external files cannot be scanned)', () => {
    expect(scan('RULE-SET:external')).toHaveLength(0)
  })
})

describe('unionRulesForDependencyScan', () => {
  const saved: CoreCConfig = {
    drivers: [{ name: 'plc1', type: 'modbus-tcp', settings: {}, tags: [] }],
    rules: [rule('shared', 'driver == "plc1"')],
    'rule-groups': { g: [rule('old-sub', 'driver == "plc1"')] },
  }
  const working: CoreCConfig = {
    drivers: [{ name: 'plc1', type: 'modbus-tcp', settings: {}, tags: [] }],
    rules: [
      rule('shared', 'value > 5'), // edited in working — working wins
      rule('pending-new', 'driver contains "plc"'), // not yet applied
    ],
  }

  it('merges rules by name with the working entry winning, and merges groups', () => {
    const src = unionRulesForDependencyScan(working, saved)
    expect(src.rules.map((r) => r.name).sort()).toEqual(['pending-new', 'shared'])
    expect(src.rules.find((r) => r.name === 'shared')?.match).toBe('value > 5')
    expect(Object.keys(src.groups)).toContain('g')
    expect(src.allDrivers.map((d) => d.name)).toEqual(['plc1'])
  })

  it('a pending-only rule warns in the delete scan (working ∪ saved)', () => {
    const src = unionRulesForDependencyScan(working, saved)
    const driver = { name: 'plc1', tags: [{ name: 'x' }] }
    expect(rulesDependingOnDriver({ driver, ...src }).map((r) => r.name)).toEqual(['pending-new'])
  })

  it('tolerates null halves', () => {
    const src = unionRulesForDependencyScan(null, saved)
    expect(src.rules).toHaveLength(1)
    const empty = unionRulesForDependencyScan(null, null)
    expect(empty.rules).toHaveLength(0)
  })
})
