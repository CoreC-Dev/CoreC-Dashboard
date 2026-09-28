import { describe, expect, it } from 'vitest'
import { DRIVER_TYPES, TRANSPORT_TYPES } from '@/types/config'
import {
  buildDefaultSettings,
  DRIVER_SETTINGS_REGISTRY,
  flattenFields,
  getDriverFieldRegistry,
  getRequiredFields,
  getTransportFieldRegistry,
  TRANSPORT_SETTINGS_REGISTRY,
  TRANSPORT_TOPLEVEL_FIELDS,
} from './settingsRegistry'

describe('settingsRegistry — driver coverage', () => {
  it('has a registry entry for every registered driver type', () => {
    for (const type of DRIVER_TYPES) {
      expect(
        DRIVER_SETTINGS_REGISTRY[type],
        `driver type "${type}" missing from registry`,
      ).toBeDefined()
    }
  })

  it('marks host as required for network modbus variants', () => {
    for (const type of [
      'modbus-tcp',
      'modbus-rtuovertcp',
      'modbus-udp',
      'modbus-rtuoverudp',
      'modbus-tls',
    ] as const) {
      const required = getRequiredFields(getDriverFieldRegistry(type))
      expect(required, `${type} should require host`).toContain('host')
    }
  })

  it('marks serial-device as required for modbus-rtu', () => {
    const required = getRequiredFields(getDriverFieldRegistry('modbus-rtu'))
    expect(required).toContain('serial-device')
    expect(required).not.toContain('host')
  })

  it('marks endpoint as required for opcua', () => {
    const required = getRequiredFields(getDriverFieldRegistry('opcua'))
    expect(required).toContain('endpoint')
  })

  it('requires cert triple (cert-file, key-file, ca-file) for modbus-tls', () => {
    const required = getRequiredFields(getDriverFieldRegistry('modbus-tls'))
    expect(required).toContain('cert-file')
    expect(required).toContain('key-file')
    expect(required).toContain('ca-file')
  })

  it('does NOT require cert triple for non-tls modbus', () => {
    const required = getRequiredFields(getDriverFieldRegistry('modbus-tcp'))
    expect(required).not.toContain('cert-file')
    expect(required).not.toContain('key-file')
    expect(required).not.toContain('ca-file')
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

  it('marks broker and client-id as required for mqtt', () => {
    const required = getRequiredFields(getTransportFieldRegistry('mqtt'))
    expect(required).toContain('broker')
    expect(required).toContain('client-id')
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

describe('settingsRegistry — flattenFields', () => {
  it('collects all fields across groups for modbus-tcp', () => {
    const fields = flattenFields(getDriverFieldRegistry('modbus-tcp'))
    const keys = fields.map((f) => f.key)
    expect(keys).toContain('host')
    expect(keys).toContain('port')
    expect(keys).toContain('reconnect-interval')
    expect(keys).toContain('max-reconnect-failures')
  })

  it('returns empty array for undefined registry', () => {
    expect(flattenFields(undefined)).toEqual([])
  })
})

describe('settingsRegistry — visibleWhen conditional fields', () => {
  it('opcua subscription fields have visibleWhen mode=subscription', () => {
    const fields = flattenFields(getDriverFieldRegistry('opcua'))
    const subInterval = fields.find((f) => f.key === 'subscription-interval')
    expect(subInterval?.visibleWhen).toEqual({ field: 'mode', equals: 'subscription' })
    const subBuffer = fields.find((f) => f.key === 'subscription-buffer')
    expect(subBuffer?.visibleWhen).toEqual({ field: 'mode', equals: 'subscription' })
  })
})
