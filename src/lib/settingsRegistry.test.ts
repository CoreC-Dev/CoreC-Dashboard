import { describe, expect, it } from 'vitest'
import { DRIVER_TYPES, TRANSPORT_TYPES } from '@/types/config'
import {
  buildDefaultSettings,
  DRIVER_SETTINGS_REGISTRY,
  getDriverFieldRegistry,
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
