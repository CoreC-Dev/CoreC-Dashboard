import { describe, expect, it } from 'vitest'
import {
  validateDriverInContext,
  validateRuleInContext,
  validateTransportInContext,
} from '@/lib/entityValidation'
import type { CoreCConfig, DriverConfig, RuleConfig, TransportConfig } from '@/types/config'

// ─── Fixtures ──────────────────────────────────────────────────────

const validDriver: DriverConfig = {
  name: 'plc1',
  type: 'modbus-tcp',
  settings: { host: '192.168.1.1', port: 502 },
  tags: [{ name: 'temp', type: 'int16', address: '400001' }],
}

const validTransport: TransportConfig = {
  name: 'mqtt-out',
  type: 'mqtt',
  settings: { broker: 'tcp://localhost:1883', topic: 'data/out' },
}

const validRule: RuleConfig = {
  name: 'r1',
  match: 'ALL',
  action: 'forward',
  target: 'mqtt-out',
  priority: 100,
}

const baseConfig: CoreCConfig = {
  drivers: [validDriver],
  transports: [validTransport],
  rules: [validRule],
}

// ─── validateDriverInContext ──────────────────────────────────────

describe('validateDriverInContext', () => {
  it('passes for a valid driver in a valid config', () => {
    const result = validateDriverInContext(baseConfig, {
      name: 'plc2',
      type: 'modbus-tcp',
      settings: { host: '10.0.0.1', port: 502 },
      tags: [{ name: 'rpm', type: 'uint16', address: '400010' }],
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('upsert replaces by name — no duplicate created', () => {
    // Adding a driver with an existing name replaces it (upsert semantics).
    // Name uniqueness is checked at the wizard canProceed gate level.
    const result = validateDriverInContext(baseConfig, {
      name: 'plc1', // same name → replaces, not duplicates
      type: 'modbus-tcp',
      settings: { host: '10.0.0.1', port: 502 },
      tags: [],
    })
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(false)
  })

  it('works with null base config', () => {
    const result = validateDriverInContext(null, validDriver)
    // A single driver with no transports is valid for zod (transports optional)
    // but cross-entity may flag no data source. The key assertion: no crash.
    expect(result).toBeDefined()
    expect(result.valid).toBeDefined()
  })

  it('edits an existing driver without duplicate-name error', () => {
    // Simulate editing plc1: same name, different host
    const result = validateDriverInContext(baseConfig, {
      name: 'plc1',
      type: 'modbus-tcp',
      settings: { host: '10.0.0.99', port: 502 },
      tags: [{ name: 'temp', type: 'int16', address: '400001' }],
    })
    // upsertDriver replaces by name, so no duplicate should be flagged
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(false)
  })
})

// ─── validateTransportInContext ───────────────────────────────────

describe('validateTransportInContext', () => {
  it('passes for a valid transport in a valid config', () => {
    const result = validateTransportInContext(baseConfig, {
      name: 'http-out',
      type: 'http',
      settings: { url: 'http://localhost:8080/data' },
    })
    expect(result.valid).toBe(true)
  })

  it('upsert replaces by name — no duplicate created', () => {
    // Adding a transport with an existing name replaces it (upsert semantics).
    const result = validateTransportInContext(baseConfig, {
      name: 'mqtt-out', // same name → replaces
      type: 'mqtt',
      settings: { broker: 'tcp://localhost:1883', topic: 'dup' },
    })
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(false)
  })
})

// ─── validateRuleInContext ────────────────────────────────────────

describe('validateRuleInContext', () => {
  it('passes for a valid rule in a valid config', () => {
    const result = validateRuleInContext(baseConfig, {
      name: 'r2',
      match: 'ALL',
      action: 'forward',
      target: 'mqtt-out',
      priority: 50,
    })
    expect(result.valid).toBe(true)
  })

  it('detects rule with non-existent target transport', () => {
    const result = validateRuleInContext(baseConfig, {
      name: 'r3',
      match: 'ALL',
      action: 'forward',
      target: 'nonexistent-transport',
      priority: 50,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('nonexistent-transport'))).toBe(true)
  })

  it('upsert replaces by name — no duplicate created', () => {
    // Adding a rule with an existing name replaces it (upsert semantics).
    const result = validateRuleInContext(baseConfig, {
      name: 'r1', // same name → replaces
      match: 'ALL',
      action: 'forward',
      target: 'mqtt-out',
      priority: 50,
    })
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(false)
  })

  it('edits an existing rule without duplicate-name error', () => {
    const result = validateRuleInContext(baseConfig, {
      name: 'r1',
      match: 'ALL',
      action: 'drop',
      priority: 200,
    })
    // upsertRule replaces by name — no duplicate
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(false)
  })
})
