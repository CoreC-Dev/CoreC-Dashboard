import { describe, expect, it } from 'vitest'
import { registryToEditFields } from '@/lib/registryAdapter'
import {
  DRIVER_TOPLEVEL_FIELDS,
  getDriverFieldRegistry,
  getTransportFieldRegistry,
  TRANSPORT_TOPLEVEL_FIELDS,
} from '@/lib/settingsRegistry'

describe('registryToEditFields', () => {
  it('returns empty array for undefined registry', () => {
    expect(registryToEditFields(undefined)).toEqual([])
  })

  it('flattens groups into a flat field list', () => {
    const registry = getDriverFieldRegistry('modbus-tcp')
    expect(registry).toBeDefined()
    const fields = registryToEditFields(registry)
    // Should have multiple fields from multiple groups
    expect(fields.length).toBeGreaterThan(5)
    // Every field should have key, labelKey, kind
    for (const f of fields) {
      expect(f.key).toBeTruthy()
      expect(f.labelKey).toBeTruthy()
      expect(['text', 'number', 'select']).toContain(f.kind)
    }
  })

  it('appends top-level fields after settings fields', () => {
    const registry = getDriverFieldRegistry('modbus-tcp')
    const fields = registryToEditFields(registry, DRIVER_TOPLEVEL_FIELDS)
    const keys = fields.map((f) => f.key)
    // Top-level fields should be at the end
    expect(keys).toContain('tags-file')
    expect(keys).toContain('tags-interval')
    const tagsFileIdx = keys.indexOf('tags-file')
    const tagsIntervalIdx = keys.indexOf('tags-interval')
    // Settings fields should come before top-level fields
    const lastSettingsIdx = Math.max(
      ...keys
        .map((k, i) => (k !== 'tags-file' && k !== 'tags-interval' ? i : -1))
        .filter((i) => i >= 0),
    )
    expect(tagsFileIdx).toBeGreaterThan(lastSettingsIdx)
    expect(tagsIntervalIdx).toBeGreaterThan(lastSettingsIdx)
  })

  it('maps FieldType → kind correctly', () => {
    const registry = getDriverFieldRegistry('modbus-tcp')!
    const fields = registryToEditFields(registry)
    // host is type 'text' → kind 'text'
    const host = fields.find((f) => f.key === 'host')
    expect(host?.kind).toBe('text')
    // port is type 'number' → kind 'number'
    const port = fields.find((f) => f.key === 'port')
    expect(port?.kind).toBe('number')
  })

  it('maps enum type to select kind with options', () => {
    const registry = getDriverFieldRegistry('opcua')!
    const fields = registryToEditFields(registry)
    const securityPolicy = fields.find((f) => f.key === 'security-policy')
    expect(securityPolicy?.kind).toBe('select')
    expect(securityPolicy?.options).toBeDefined()
    expect(securityPolicy!.options!.length).toBeGreaterThan(0)
  })

  it('derives placeholder from default when placeholder is absent', () => {
    const registry = getDriverFieldRegistry('modbus-tcp')!
    const fields = registryToEditFields(registry)
    // port has default 502 → placeholder '502'
    const port = fields.find((f) => f.key === 'port')
    expect(port?.placeholder).toBe('502')
  })

  it('maps duration type to text kind', () => {
    const registry = getDriverFieldRegistry('modbus-tcp')!
    const fields = registryToEditFields(registry)
    // timeout is type 'duration' → kind 'text'
    const timeout = fields.find((f) => f.key === 'timeout')
    expect(timeout?.kind).toBe('text')
  })

  it('works for transports with top-level fields', () => {
    const registry = getTransportFieldRegistry('mqtt')!
    const fields = registryToEditFields(registry, TRANSPORT_TOPLEVEL_FIELDS)
    expect(fields.length).toBeGreaterThan(5)
    // Should include transport top-level fields
    const keys = fields.map((f) => f.key)
    expect(keys).toContain('batch-size')
    expect(keys).toContain('flush-interval')
  })

  // ─── Known divergences (documented for Batch I migration) ──────────

  it('DOCUMENTED: registry has reconnect fields that detail arrays lack for some drivers', () => {
    // The registry includes reconnect-interval, reconnect-max-interval,
    // max-reconnect-failures for every driver. The detail page arrays only
    // include them for modbus-tcp. Full migration will ADD these fields
    // to modbus-tls, modbus-rtu, s7, opcua edit forms (behavior change).
    for (const type of ['modbus-tls', 'modbus-rtu', 's7', 'opcua']) {
      const registry = getDriverFieldRegistry(type)!
      const fields = registryToEditFields(registry)
      expect(fields.some((f) => f.key === 'reconnect-interval')).toBe(true)
    }
  })

  it('DOCUMENTED: OPCUA registry has 4 security-policy options (detail page has 6)', () => {
    // Detail page exposes 6 options including Basic128Rsa15 and Basic256.
    // Registry has 4. Migration will DROP 2 options (behavior change).
    // Batch I must decide which set is correct.
    const registry = getDriverFieldRegistry('opcua')!
    const fields = registryToEditFields(registry)
    const securityPolicy = fields.find((f) => f.key === 'security-policy')
    expect(securityPolicy?.options?.length).toBe(4)
  })

  it('DOCUMENTED: modbus-tls registry port default is 802 (detail page placeholder is 502)', () => {
    // The detail page shows port placeholder '502' (wrong for TLS).
    // Registry has default 802 (correct). Migration will fix this
    // placeholder (behavior change, but arguably a bug fix).
    const registry = getDriverFieldRegistry('modbus-tls')!
    const fields = registryToEditFields(registry)
    const port = fields.find((f) => f.key === 'port')
    expect(port?.placeholder).toBe('802')
  })

  // ─── Single-source migration parity (TD-ARCH-011 / TD-DUP-001) ──────

  it('every driver registry field is tagged with a group (settings|top)', () => {
    for (const type of ['modbus-tcp', 'modbus-rtu', 'modbus-tls', 's7', 'opcua']) {
      const fields = registryToEditFields(getDriverFieldRegistry(type), DRIVER_TOPLEVEL_FIELDS)
      for (const f of fields) {
        expect(['settings', 'top']).toContain(f.group)
      }
      // tags-file / tags-interval are top-level (bug fix: were inside settings).
      const tagsFile = fields.find((f) => f.key === 'tags-file')
      expect(tagsFile?.group).toBe('top')
    }
  })

  it('registry boolean fields render as true/false select with boolean flag', () => {
    // mqtt clean-session / retained are boolean in the registry.
    const fields = registryToEditFields(
      getTransportFieldRegistry('mqtt')!,
      TRANSPORT_TOPLEVEL_FIELDS,
    )
    const cleanSession = fields.find((f) => f.key === 'clean-session')!
    expect(cleanSession.kind).toBe('select')
    expect(cleanSession.options).toEqual(['true', 'false'])
    expect(cleanSession.boolean).toBe(true)
    expect(cleanSession.group).toBe('settings')
  })

  it('transport curated edit keys all resolve in the registry (except headers)', () => {
    // Guards the TransportDetailPage curated key list: every key (bar `headers`,
    // which is a map supplement) must exist in the registry so no field silently
    // disappears from the edit form when the registry evolves.
    const mqttKeys = new Set([
      'broker',
      'topic-template',
      'client-id',
      'qos',
      'data-topic',
      'command-topic',
      'retained',
      'clean-session',
      'keep-alive',
      'connect-timeout',
      'publish-timeout',
      'auto-reconnect',
      'username',
      'password',
      'retry-count',
      'buffer-size',
    ])
    const httpKeys = new Set([
      'url',
      'method',
      'webhook-addr',
      'webhook-path',
      'webhook-secret',
      'timeout',
      'max-idle-conns',
      'idle-conn-timeout',
      'batch-size',
      'flush-interval',
      'retry-count',
      'buffer-size',
    ])
    const mqttAll = new Set(
      registryToEditFields(getTransportFieldRegistry('mqtt')!, TRANSPORT_TOPLEVEL_FIELDS).map(
        (f) => f.key,
      ),
    )
    const httpAll = new Set(
      registryToEditFields(getTransportFieldRegistry('http')!, TRANSPORT_TOPLEVEL_FIELDS).map(
        (f) => f.key,
      ),
    )
    for (const k of mqttKeys) expect(mqttAll.has(k)).toBe(true)
    for (const k of httpKeys) expect(httpAll.has(k)).toBe(true)
  })
})
