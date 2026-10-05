import { describe, expect, it } from 'vitest'
import {
  coreCConfigSchema,
  isValidGoDuration,
  validateConfig,
  validateFullConfig,
} from '@/lib/configSchema'
import type { CoreCConfig } from '@/types/config'

// Narrow safeParse result to the error issues when expecting failure.
// Throws if parse unexpectedly succeeded, so res.error is guaranteed non-null.
function failIssues(res: ReturnType<typeof coreCConfigSchema.safeParse>): string {
  if (res.success) throw new Error('expected schema parse to fail, but it succeeded')
  return JSON.stringify(res.error.issues)
}

// A minimal valid config (mirrors config.example.yaml's active entries).
// `satisfies` keeps the literal type so drivers/transports/rules are
// non-optional arrays (CoreCConfig marks them optional), enabling direct
// indexed access without null narrowing in assertions below.
const validConfig = {
  global: {
    'log-level': 'info',
    api: { listen: '0.0.0.0:9090', secret: 'corec-secret-token' },
  },
  drivers: [
    {
      name: 'plc-modbus',
      type: 'modbus-tcp',
      settings: { host: '192.168.1.100', port: 502, 'slave-id': 1, timeout: '3s' },
      tags: [{ name: 'temperature', address: '40001', type: 'float32', interval: '1s' }],
    },
  ],
  transports: [
    {
      name: 'cloud-mqtt',
      type: 'mqtt',
      settings: { broker: 'tcp://broker.emqx.io:1883', 'client-id': 'edge-01', qos: 1 },
    },
    {
      name: 'mes-http-push',
      type: 'http',
      settings: { url: 'http://localhost:8080/api/v1/telemetry', method: 'POST' },
    },
  ],
  rules: [
    {
      name: 'high-temp',
      match: "tag == 'temperature' && value > 95",
      action: 'alert',
      target: 'cloud-mqtt',
      priority: 1,
    },
    { name: 'catch-all', match: 'ALL', action: 'forward', target: 'mes-http-push', priority: 999 },
  ],
} satisfies CoreCConfig

describe('isValidGoDuration', () => {
  it('accepts standard durations', () => {
    expect(isValidGoDuration('30s')).toBe(true)
    expect(isValidGoDuration('500ms')).toBe(true)
    expect(isValidGoDuration('1h30m')).toBe(true)
    expect(isValidGoDuration('2h45m')).toBe(true)
    expect(isValidGoDuration('10us')).toBe(true)
  })
  it('accepts empty (unset)', () => {
    expect(isValidGoDuration('')).toBe(true)
    expect(isValidGoDuration(undefined)).toBe(true)
  })
  it('rejects zero duration (server requires > 0)', () => {
    expect(isValidGoDuration('0')).toBe(false)
    expect(isValidGoDuration('0s')).toBe(false)
  })
  it('rejects invalid formats', () => {
    expect(isValidGoDuration('abc')).toBe(false)
    expect(isValidGoDuration('30')).toBe(false)
    expect(isValidGoDuration('s30')).toBe(false)
  })
})

describe('coreCConfigSchema — valid config', () => {
  it('parses a minimal valid config without errors', () => {
    const res = coreCConfigSchema.safeParse(validConfig)
    expect(res.success).toBe(true)
  })
  it('parses the full example.yaml-style config', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: {
        ...validConfig.global,
        engine: {
          'data-bus-size': 8192,
          'shutdown-timeout': '30s',
          'default-tag-interval': '1s',
          'on-bad-quality': 'mark-and-publish',
        },
        buffer: { enabled: true, path: '/var/lib/corec/buffer', 'max-size': 10000 },
      },
    })
    expect(res.success).toBe(true)
  })
})

describe('coreCConfigSchema — driver validation', () => {
  it('rejects empty driver name', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [{ ...validConfig.drivers[0], name: '' }],
    })
    expect(res.success).toBe(false)
  })
  it('rejects driver with no tags', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [{ ...validConfig.drivers[0], tags: [] }],
    })
    expect(res.success).toBe(false)
  })
  it('rejects modbus-tcp missing host', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [
        {
          ...validConfig.drivers[0],
          settings: { port: 502, 'slave-id': 1 },
        },
      ],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('host is required')
  })
  it('rejects modbus-tls missing certificate triple', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [
        {
          name: 'mtls',
          type: 'modbus-tls',
          settings: { host: '1.2.3.4' },
          tags: validConfig.drivers[0].tags,
        },
      ],
    })
    expect(res.success).toBe(false)
    const msgs = failIssues(res)
    expect(msgs).toContain('cert-file')
    expect(msgs).toContain('key-file')
    expect(msgs).toContain('ca-file')
  })
  it('accepts modbus-tls with full certificate triple', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [
        {
          name: 'mtls',
          type: 'modbus-tls',
          settings: {
            host: '1.2.3.4',
            'cert-file': 'c.pem',
            'key-file': 'k.pem',
            'ca-file': 'a.pem',
          },
          tags: validConfig.drivers[0].tags,
        },
      ],
    })
    expect(res.success).toBe(true)
  })
  it('rejects opcua missing endpoint', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [
        {
          name: 'opc',
          type: 'opcua',
          settings: { mode: 'polling' },
          tags: validConfig.drivers[0].tags,
        },
      ],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('endpoint')
  })
  it('rejects duplicate tag names within a driver', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [
        {
          ...validConfig.drivers[0],
          tags: [
            { name: 'dup', address: '1', type: 'float32' },
            { name: 'dup', address: '2', type: 'float32' },
          ],
        },
      ],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('duplicate tag name')
  })
  it('rejects invalid tag type', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [
        {
          ...validConfig.drivers[0],
          tags: [{ name: 't', address: '1', type: 'decimal' as never }],
        },
      ],
    })
    expect(res.success).toBe(false)
  })
  it('rejects invalid interval duration', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      drivers: [
        {
          ...validConfig.drivers[0],
          tags: [{ name: 't', address: '1', type: 'float32', interval: 'abc' }],
        },
      ],
    })
    expect(res.success).toBe(false)
  })
})

describe('coreCConfigSchema — transport validation', () => {
  it('rejects mqtt missing broker', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      transports: [
        {
          name: 'm',
          type: 'mqtt',
          settings: { 'client-id': 'x' },
        },
        validConfig.transports[1],
      ],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('broker is required')
  })
  it('rejects http missing both url and webhook-addr', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      transports: [
        validConfig.transports[0],
        {
          name: 'h',
          type: 'http',
          settings: { method: 'POST' },
        },
      ],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('either url or webhook-addr is required')
  })
  it('rejects batch-size misplaced inside settings', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      transports: [
        {
          ...validConfig.transports[0],
          settings: { broker: 'tcp://x:1883', 'batch-size': 50 },
        },
        validConfig.transports[1],
      ],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('must be a top-level transport field')
  })
  it('rejects mqtt TLS files with non-TLS broker scheme', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      transports: [
        {
          name: 'm',
          type: 'mqtt',
          settings: {
            broker: 'tcp://broker:1883',
            'tls-cert-file': 'c.pem',
            'tls-key-file': 'k.pem',
          },
        },
        validConfig.transports[1],
      ],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('not TLS')
  })
})

describe('coreCConfigSchema — rule validation', () => {
  it('rejects unknown action', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      rules: [{ name: 'r', match: 'ALL', action: 'delete' as never, target: 'cloud-mqtt' }],
    })
    expect(res.success).toBe(false)
  })
  it('rejects transform action without transform config', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      rules: [{ name: 'r', match: 'ALL', action: 'transform', target: 'cloud-mqtt' }],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('transform action requires')
  })
  it('rejects mirror action without targets', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      rules: [{ name: 'r', match: 'ALL', action: 'mirror' }],
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('mirror action requires')
  })
  it('accepts mirror with multiple targets', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      rules: [
        {
          name: 'r',
          match: 'ALL',
          action: 'mirror',
          targets: ['cloud-mqtt', 'mes-http-push'],
        },
      ],
    })
    expect(res.success).toBe(true)
  })
})

describe('coreCConfigSchema — global validation', () => {
  it('rejects api.secret < 8 chars when listen set', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: { 'log-level': 'info', api: { listen: '0.0.0.0:9090', secret: 'short' } },
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('at least 8 characters')
  })
  it('rejects api.secret missing when listen set', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: { 'log-level': 'info', api: { listen: '0.0.0.0:9090' } },
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('secret is required')
  })
  it('rejects buffer.enabled without path', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: { ...validConfig.global, buffer: { enabled: true } },
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('buffer.path is not set')
  })
  it('rejects buffer.max-size < 10', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: { ...validConfig.global, buffer: { enabled: true, path: '/x', 'max-size': 5 } },
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('at least 10')
  })
  it('rejects unpaired tls-cert/tls-key', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: {
        'log-level': 'info',
        api: { listen: '0.0.0.0:9090', secret: 'longenough', 'tls-cert': 'c.pem' },
      },
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('must be set together')
  })
  it('accepts log-format: "" (CoreC returns empty string when unset)', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: { ...validConfig.global, 'log-format': '' },
    })
    expect(res.success).toBe(true)
  })
  it('accepts log-format: "text" and "json"', () => {
    for (const fmt of ['text', 'json'] as const) {
      const res = coreCConfigSchema.safeParse({
        ...validConfig,
        global: { ...validConfig.global, 'log-format': fmt },
      })
      expect(res.success).toBe(true)
    }
  })
  it('rejects log-format: "xml" (invalid value)', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: { ...validConfig.global, 'log-format': 'xml' },
    })
    expect(res.success).toBe(false)
  })
  it('accepts api.secret: "***" (redacted sentinel from GET /configs/raw)', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: {
        ...validConfig.global,
        api: { listen: '0.0.0.0:9090', secret: '***' },
      },
    })
    expect(res.success).toBe(true)
  })
  it('still rejects a genuinely short api.secret (not the sentinel)', () => {
    const res = coreCConfigSchema.safeParse({
      ...validConfig,
      global: {
        ...validConfig.global,
        api: { listen: '0.0.0.0:9090', secret: 'short' },
      },
    })
    expect(res.success).toBe(false)
    expect(failIssues(res)).toContain('at least 8 characters')
  })
})

describe('validateConfig — cross-entity rules', () => {
  it('passes for valid config', () => {
    const res = validateConfig(validConfig)
    expect(res.valid).toBe(true)
    expect(res.errors).toEqual([])
  })
  it('accepts no data source with a non-blocking warning (idle mode)', () => {
    const res = validateConfig({
      ...validConfig,
      drivers: [],
      transports: [{ name: 'm', type: 'mqtt', settings: { broker: 'tcp://x:1883' } }],
      rules: [],
    })
    expect(res.valid).toBe(true)
    expect(res.warnings.some((e) => e.message.includes('no data source'))).toBe(true)
  })
  it('accepts relay node with inbound transport and no drivers', () => {
    // Relay: no drivers, but an inbound mqtt transport (data-topic) is the data source.
    // rules must be empty (or target the inbound transport) since other transports are gone.
    const res = validateConfig({
      ...validConfig,
      drivers: [],
      transports: [
        { name: 'm', type: 'mqtt', settings: { broker: 'tcp://x:1883', 'data-topic': 'up/#' } },
      ],
      rules: [],
    })
    expect(res.valid).toBe(true)
  })
  it('accepts no transports with a non-blocking warning (idle mode)', () => {
    const res = validateConfig({ ...validConfig, transports: [], rules: [] })
    expect(res.valid).toBe(true)
    expect(res.warnings.some((e) => e.message.includes('at least one transport'))).toBe(true)
  })
  it('rejects duplicate driver names', () => {
    const res = validateConfig({
      ...validConfig,
      drivers: [validConfig.drivers[0], { ...validConfig.drivers[0] }],
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('duplicate driver name'))).toBe(true)
  })
  it('rejects rule target referencing non-existent transport', () => {
    const res = validateConfig({
      ...validConfig,
      rules: [{ name: 'r', match: 'ALL', action: 'forward', target: 'no-such-transport' }],
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('"no-such-transport" not found'))).toBe(true)
  })
  it('rejects unknown driver type', () => {
    const res = validateConfig({
      ...validConfig,
      drivers: [
        {
          name: 'x',
          type: 'unknown-protocol',
          settings: {},
          tags: [{ name: 't', address: '1', type: 'float32' }],
        },
      ],
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('unknown driver type'))).toBe(true)
  })

  // ─── Transport fallback validation ──────────────────────────────
  it('passes when transport fallback references an existing transport', () => {
    const res = validateConfig({
      ...validConfig,
      transports: [
        ...validConfig.transports,
        {
          name: 'backup-mqtt',
          type: 'mqtt',
          settings: { broker: 'tcp://localhost:1884' },
          fallback: 'cloud-mqtt',
        },
      ],
    })
    expect(res.errors.some((e) => e.message.includes('fallback'))).toBe(false)
  })

  it('detects transport fallback referencing non-existent transport', () => {
    const res = validateConfig({
      ...validConfig,
      transports: [
        {
          ...validConfig.transports[0],
          fallback: 'nonexistent-transport',
        },
      ],
    })
    expect(res.valid).toBe(false)
    expect(
      res.errors.some(
        (e) => e.message.includes('fallback transport') && e.message.includes('not found'),
      ),
    ).toBe(true)
  })

  it('detects transport self-fallback (infinite loop)', () => {
    const res = validateConfig({
      ...validConfig,
      transports: [
        {
          ...validConfig.transports[0],
          fallback: validConfig.transports[0].name, // self
        },
      ],
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('cannot be itself'))).toBe(true)
  })
})

describe('validateFullConfig', () => {
  it('collects both schema and cross-entity errors', () => {
    // Schema error (empty driver name) + cross-entity ok
    const res = validateFullConfig({
      ...validConfig,
      drivers: [{ ...validConfig.drivers[0], name: '' }],
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('driver name cannot be empty'))).toBe(true)
  })
  it('passes for fully valid config', () => {
    expect(validateFullConfig(validConfig).valid).toBe(true)
  })
})

// ─── Rule groups: SUB-RULE circular reference detection ──────────

describe('validateConfig: rule-groups SUB-RULE validation', () => {
  it('passes for rule groups with no SUB-RULE references', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'filter-group': [
          { name: 'filter1', match: 'tag == "temp"', action: 'forward', target: 'cloud-mqtt' },
        ],
      },
    })
    expect(res.errors.some((e) => e.message.includes('circular'))).toBe(false)
    expect(res.errors.some((e) => e.message.includes('SUB-RULE'))).toBe(false)
  })

  it('passes for valid SUB-RULE chain (no cycle)', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'group-a': [
          { name: 'a1', match: 'SUB-RULE:group-b', action: 'forward', target: 'cloud-mqtt' },
        ],
        'group-b': [{ name: 'b1', match: 'ALL', action: 'drop' }],
      },
    })
    expect(res.errors.some((e) => e.message.includes('circular'))).toBe(false)
  })

  it('detects direct self-referencing SUB-RULE (A→A)', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'group-a': [
          { name: 'a1', match: 'SUB-RULE:group-a', action: 'forward', target: 'cloud-mqtt' },
        ],
      },
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('circular'))).toBe(true)
  })

  it('detects indirect circular SUB-RULE chain (A→B→A)', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'group-a': [
          { name: 'a1', match: 'SUB-RULE:group-b', action: 'forward', target: 'cloud-mqtt' },
        ],
        'group-b': [{ name: 'b1', match: 'SUB-RULE:group-a', action: 'drop' }],
      },
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('circular'))).toBe(true)
  })

  it('detects longer circular chain (A→B→C→A)', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'group-a': [
          { name: 'a1', match: 'SUB-RULE:group-b', action: 'forward', target: 'cloud-mqtt' },
        ],
        'group-b': [{ name: 'b1', match: 'SUB-RULE:group-c', action: 'drop' }],
        'group-c': [{ name: 'c1', match: 'SUB-RULE:group-a', action: 'alert' }],
      },
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('circular'))).toBe(true)
  })

  it('detects SUB-RULE reference to non-existent group', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'group-a': [
          { name: 'a1', match: 'SUB-RULE:nonexistent', action: 'forward', target: 'cloud-mqtt' },
        ],
      },
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('non-existent group'))).toBe(true)
  })

  it('validates target transport references inside rule groups', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'group-a': [
          { name: 'a1', match: 'ALL', action: 'forward', target: 'nonexistent-transport' },
        ],
      },
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('target transport'))).toBe(true)
  })

  it('handles case-insensitive SUB-RULE prefix', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'group-a': [
          { name: 'a1', match: 'sub-rule:group-a', action: 'forward', target: 'cloud-mqtt' },
        ],
      },
    })
    expect(res.valid).toBe(false)
    expect(res.errors.some((e) => e.message.includes('circular'))).toBe(true)
  })

  // ─── M-6 regression: no duplicate cycle errors with inbound node ──
  it('reports exactly one circular error when an inbound node references a cycle', () => {
    const res = validateConfig({
      ...validConfig,
      'rule-groups': {
        'group-a': [
          { name: 'a1', match: 'SUB-RULE:group-b', action: 'forward', target: 'cloud-mqtt' },
        ],
        'group-b': [{ name: 'b1', match: 'SUB-RULE:group-c', action: 'drop' }],
        'group-c': [{ name: 'c1', match: 'SUB-RULE:group-a', action: 'alert' }],
        'group-x': [
          { name: 'x1', match: 'SUB-RULE:group-a', action: 'forward', target: 'cloud-mqtt' },
        ],
      },
    })
    const circularErrors = res.errors.filter((e) => e.message.includes('circular'))
    expect(circularErrors.length).toBe(1)
  })
})
