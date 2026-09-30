/**
 * Tests for the validation pipeline: configStore workingConfig →
 * validateFullConfig. Tests the pure function directly since the hook
 * is a thin useMemo wrapper around it.
 *
 * These tests verify that the same validation logic used by
 * useConfigValidation (consumed by ConfigCenterPage/DriversPage/
 * TransportsPage/RulesPage apply dialogs) correctly catches the
 * cross-entity rules from CoreC config.validate.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { validateFullConfig } from '@/lib/configSchema'
import { useConfigStore } from '@/stores/configStore'
import type { CoreCConfig } from '@/types/config'

// A valid minimal config: 1 driver + 1 transport + 1 rule targeting that transport
const validConfig: CoreCConfig = {
  global: { 'log-level': 'info', api: { listen: ':9090', secret: 'test-secret' } },
  drivers: [
    {
      name: 'drv1',
      type: 'modbus-tcp',
      settings: { host: '127.0.0.1', port: 502, 'slave-id': 1 },
      tags: [{ name: 't1', address: '40001', type: 'float32', interval: '1s' }],
    },
  ],
  transports: [
    {
      name: 'tp1',
      type: 'mqtt',
      settings: { broker: 'tcp://localhost:1883', 'client-id': 'c1', qos: 1 },
    },
  ],
  rules: [{ name: 'r1', match: 'ALL', action: 'forward', target: 'tp1', priority: 100 }],
}

beforeEach(() => {
  useConfigStore.setState({
    workingConfig: null,
    savedConfig: null,
    dirty: false,
    error: null,
  })
})

describe('validateFullConfig — the function behind useConfigValidation', () => {
  it('returns valid=true for a well-formed config', () => {
    const result = validateFullConfig(validConfig)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detects missing transports (cross-entity rule)', () => {
    const bad: CoreCConfig = { ...validConfig, transports: [] }
    const result = validateFullConfig(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'transports')).toBe(true)
  })

  it('detects rule target referencing non-existent transport', () => {
    const bad: CoreCConfig = {
      ...validConfig,
      rules: [{ name: 'r1', match: 'ALL', action: 'forward', target: 'nonexistent', priority: 1 }],
    }
    const result = validateFullConfig(bad)
    expect(result.valid).toBe(false)
    const targetErr = result.errors.find((e) => e.path.includes('target'))
    expect(targetErr).toBeDefined()
    expect(targetErr?.message).toContain('nonexistent')
  })

  it('detects duplicate driver names', () => {
    const bad: CoreCConfig = {
      ...validConfig,
      drivers: [
        { ...validConfig.drivers![0] },
        {
          name: 'drv1',
          type: 'modbus-tcp',
          settings: { host: '127.0.0.2', port: 502, 'slave-id': 2 },
          tags: [{ name: 't2', address: '40002', type: 'uint16', interval: '2s' }],
        },
      ],
    }
    const result = validateFullConfig(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('duplicate driver name'))).toBe(true)
  })

  it('detects no data source when drivers empty and no inbound transport', () => {
    const bad: CoreCConfig = {
      ...validConfig,
      drivers: [],
      transports: [
        {
          name: 'tp1',
          type: 'mqtt',
          settings: { broker: 'tcp://localhost:1883', 'client-id': 'c1', qos: 1 },
          // no data-topic → not inbound
        },
      ],
    }
    const result = validateFullConfig(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'drivers')).toBe(true)
  })

  it('detects duplicate transport names', () => {
    const bad: CoreCConfig = {
      ...validConfig,
      transports: [
        { ...validConfig.transports![0] },
        {
          name: 'tp1',
          type: 'http',
          settings: { url: 'http://localhost:8080', method: 'POST' },
        },
      ],
    }
    const result = validateFullConfig(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('duplicate transport name'))).toBe(true)
  })

  it('detects unknown driver type', () => {
    const bad = {
      ...validConfig,
      drivers: [
        {
          name: 'drv1',
          type: 'unknown-protocol',
          settings: {},
          tags: [{ name: 't1', address: '1', type: 'uint16', interval: '1s' }],
        },
      ],
    } as unknown as CoreCConfig
    const result = validateFullConfig(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('unknown driver type'))).toBe(true)
  })

  it('detects rule targets (plural) referencing non-existent transport', () => {
    const bad: CoreCConfig = {
      ...validConfig,
      rules: [
        {
          name: 'r1',
          match: 'ALL',
          action: 'mirror',
          targets: ['tp1', 'ghost'],
          priority: 1,
        } as never,
      ],
    }
    const result = validateFullConfig(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('"ghost" not found'))).toBe(true)
  })

  it('accepts auto-discovery node as data source (no drivers needed)', () => {
    const ok: CoreCConfig = {
      ...validConfig,
      drivers: [],
      node: { id: 'node-01', subscribe: ['temperature'] },
    }
    const result = validateFullConfig(ok)
    // Should NOT have the "no data source" error
    expect(result.errors.some((e) => e.path === 'drivers')).toBe(false)
  })

  it('accepts inbound mqtt transport as data source (no drivers needed)', () => {
    const ok: CoreCConfig = {
      ...validConfig,
      drivers: [],
      transports: [
        {
          name: 'tp1',
          type: 'mqtt',
          settings: {
            broker: 'tcp://localhost:1883',
            'client-id': 'c1',
            qos: 1,
            'data-topic': 'sensor/+',
          },
        },
      ],
    }
    const result = validateFullConfig(ok)
    expect(result.errors.some((e) => e.path === 'drivers')).toBe(false)
  })
})

describe('validateFullConfig — integration with configStore', () => {
  it('validating the workingConfig after store mutations catches errors', () => {
    useConfigStore.setState({
      workingConfig: validConfig,
      savedConfig: validConfig,
      dirty: false,
      error: null,
    })
    const cfg = useConfigStore.getState().workingConfig!
    expect(validateFullConfig(cfg).valid).toBe(true)

    // Remove the only transport → cross-entity validation should fail
    useConfigStore.getState().removeTransport('tp1')
    const cfg2 = useConfigStore.getState().workingConfig!
    const result = validateFullConfig(cfg2)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path === 'transports')).toBe(true)
  })

  it('validating after adding a rule with bad target catches the error', () => {
    useConfigStore.setState({
      workingConfig: validConfig,
      savedConfig: validConfig,
      dirty: false,
      error: null,
    })
    useConfigStore.getState().upsertRule({
      name: 'bad-rule',
      match: 'ALL',
      action: 'forward',
      target: 'no-such-transport',
      priority: 50,
    })
    const cfg = useConfigStore.getState().workingConfig!
    const result = validateFullConfig(cfg)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('no-such-transport'))).toBe(true)
  })
})
