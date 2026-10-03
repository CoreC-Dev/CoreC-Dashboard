import { describe, expect, it } from 'vitest'
import {
  buildDefaultSettings,
  DRIVER_SETTINGS_REGISTRY,
  getDriverFieldRegistry,
  getTransportFieldRegistry,
  TRANSPORT_SETTINGS_REGISTRY,
  TRANSPORT_TOPLEVEL_FIELDS,
} from '@/lib/settingsRegistry'
import { DRIVER_TYPES, TRANSPORT_TYPES } from '@/types/config'

describe('settingsRegistry — driver coverage', () => {
  it('has a registry entry for every registered driver type', () => {
    for (const type of DRIVER_TYPES) {
      expect(
        DRIVER_SETTINGS_REGISTRY[type],
        `driver type "${type}" missing from registry`,
      ).toBeDefined()
    }
  })
})

describe('settingsRegistry — transport coverage', () => {
  it('has a registry entry for every registered transport type', () => {
    for (const type of TRANSPORT_TYPES) {
      expect(
        TRANSPORT_SETTINGS_REGISTRY[type],
        `transport type "${type}" missing from registry`,
      ).toBeDefined()
    }
  })

  it('has top-level fields (batch-size, flush-interval, retry-count, buffer-size, fallback)', () => {
    const keys = TRANSPORT_TOPLEVEL_FIELDS.map((f) => f.key)
    expect(keys).toContain('batch-size')
    expect(keys).toContain('flush-interval')
    expect(keys).toContain('retry-count')
    expect(keys).toContain('buffer-size')
    expect(keys).toContain('fallback')
  })
})

describe('settingsRegistry — buildDefaultSettings', () => {
  it('returns server defaults for modbus-tcp', () => {
    const defaults = buildDefaultSettings(getDriverFieldRegistry('modbus-tcp'))
    expect(defaults.port).toBe(502)
    expect(defaults['slave-id']).toBe(1)
    expect(defaults.timeout).toBe('3s')
    expect(defaults.retry).toBe(3)
    expect(defaults['reconnect-interval']).toBe('2s')
    expect(defaults['max-reconnect-failures']).toBe(20)
    // host has no default (required, user must fill)
    expect(defaults.host).toBeUndefined()
  })

  it('returns server defaults for opcua', () => {
    const defaults = buildDefaultSettings(getDriverFieldRegistry('opcua'))
    expect(defaults.mode).toBe('polling')
    expect(defaults.timeout).toBe('5s')
    expect(defaults['subscription-interval']).toBe('500ms')
    expect(defaults['max-batch-size']).toBe(1000)
    // endpoint has no default
    expect(defaults.endpoint).toBeUndefined()
  })

  it('returns server defaults for mqtt', () => {
    const defaults = buildDefaultSettings(getTransportFieldRegistry('mqtt'))
    expect(defaults.qos).toBe(1)
    expect(defaults['clean-session']).toBe(true)
    expect(defaults.retained).toBe(false)
    expect(defaults['keep-alive']).toBe('60s')
    // broker has no default (required)
    expect(defaults.broker).toBeUndefined()
  })

  it('returns empty object for undefined registry', () => {
    expect(buildDefaultSettings(undefined)).toEqual({})
  })
})

// ─── TD-TEST-016: field metadata coverage across all types ──────────

describe('settingsRegistry — field metadata (all driver types)', () => {
  it('every driver type resolves a registry with at least one group', () => {
    for (const type of DRIVER_TYPES) {
      const reg = getDriverFieldRegistry(type)
      expect(reg, `driver ${type}`).toBeDefined()
      expect(reg!.groups.length, `driver ${type}`).toBeGreaterThan(0)
    }
  })

  it('modbus-tcp host is required, port has min/max bounds', () => {
    const reg = getDriverFieldRegistry('modbus-tcp')!
    const allFields = reg.groups.flatMap((g) => g.fields)
    const host = allFields.find((f) => f.key === 'host')!
    expect(host.required).toBe(true)
    expect(host.type).toBe('text')
    const port = allFields.find((f) => f.key === 'port')!
    expect(port.type).toBe('number')
    expect(port.min).toBe(1)
    expect(port.max).toBe(65535)
    const slaveId = allFields.find((f) => f.key === 'slave-id')!
    expect(slaveId.min).toBe(0)
    expect(slaveId.max).toBe(247)
  })

  it('opcua security-policy is an enum with 4 options', () => {
    const reg = getDriverFieldRegistry('opcua')!
    const sp = reg.groups.flatMap((g) => g.fields).find((f) => f.key === 'security-policy')!
    expect(sp.type).toBe('enum')
    expect(sp.options).toHaveLength(4)
    expect(sp.options).toContain('None')
    expect(sp.options).not.toContain('Basic128Rsa15')
  })

  it('reconnect group fields have defaults', () => {
    for (const type of ['modbus-tcp', 'modbus-rtu', 'modbus-tls', 's7', 'opcua']) {
      const reg = getDriverFieldRegistry(type)!
      const fields = reg.groups.flatMap((g) => g.fields)
      const interval = fields.find((f) => f.key === 'reconnect-interval')
      if (interval) {
        expect(interval.default, `${type} reconnect-interval`).toBeDefined()
      }
    }
  })
})

describe('settingsRegistry — field metadata (all transport types)', () => {
  it('every transport type resolves a registry with at least one group', () => {
    for (const type of TRANSPORT_TYPES) {
      const reg = getTransportFieldRegistry(type)
      expect(reg, `transport ${type}`).toBeDefined()
      expect(reg!.groups.length, `transport ${type}`).toBeGreaterThan(0)
    }
  })

  it('mqtt qos is an enum with [0,1,2]', () => {
    const reg = getTransportFieldRegistry('mqtt')!
    const qos = reg.groups.flatMap((g) => g.fields).find((f) => f.key === 'qos')!
    expect(qos.type).toBe('enum')
    expect(qos.options).toEqual(['0', '1', '2'])
  })

  it('mqtt boolean fields (retained, clean-session) are type boolean', () => {
    const reg = getTransportFieldRegistry('mqtt')!
    const fields = reg.groups.flatMap((g) => g.fields)
    expect(fields.find((f) => f.key === 'retained')!.type).toBe('boolean')
    expect(fields.find((f) => f.key === 'clean-session')!.type).toBe('boolean')
  })

  it('http method is an enum with GET/POST/PUT/PATCH', () => {
    const reg = getTransportFieldRegistry('http')!
    const method = reg.groups.flatMap((g) => g.fields).find((f) => f.key === 'method')!
    expect(method.type).toBe('enum')
    expect(method.options).toEqual(['GET', 'POST', 'PUT', 'PATCH'])
  })

  it('fallback is a dynamic select (optionsSource: transports)', () => {
    const fallback = TRANSPORT_TOPLEVEL_FIELDS.find((f) => f.key === 'fallback')!
    expect(fallback.type).toBe('select')
    expect(fallback.optionsSource).toBe('transports')
  })
})

describe('settingsRegistry — buildDefaultSettings (all types)', () => {
  it('produces defaults for every driver type without throwing', () => {
    for (const type of DRIVER_TYPES) {
      const defaults = buildDefaultSettings(getDriverFieldRegistry(type))
      expect(typeof defaults).toBe('object')
    }
  })

  it('produces defaults for every transport type without throwing', () => {
    for (const type of TRANSPORT_TYPES) {
      const defaults = buildDefaultSettings(getTransportFieldRegistry(type))
      expect(typeof defaults).toBe('object')
    }
  })

  it('registry with no defaults yields empty object', () => {
    const reg = getDriverFieldRegistry('modbus-tcp')!
    const noDefaults = {
      groups: reg.groups.map((g) => ({
        ...g,
        fields: g.fields.map((f) => ({ ...f, default: undefined })),
      })),
    }
    expect(buildDefaultSettings(noDefaults)).toEqual({})
  })
})
