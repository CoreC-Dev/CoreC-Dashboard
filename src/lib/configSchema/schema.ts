/**
 * configSchema/schema.ts — the per-entity zod tree: tag, driver,
 * transport, rule, rule-provider, api/engine/buffer/global/node, and the
 * top-level coreCConfigSchema. Mirrors the server-side validation in
 * CoreC's config.validate() plus the per-driver/transport Init-time
 * required field checks, so invalid configs are caught before the
 * PUT /configs hot-reload.
 */
import { z } from 'zod'
import { durationString, requiredDuration } from '@/lib/configSchema/duration'
import {
  DATA_TYPES,
  LOG_FORMATS,
  LOG_LEVELS,
  NODE_ROLES,
  NOTIFY_CHANNELS,
  ON_BAD_QUALITY_POLICIES,
  ON_MISSING_POLICIES,
  PARITY_VALUES,
  RULE_ACTIONS,
} from '@/types/config'

export { isValidGoDuration } from '@/lib/configSchema/duration'

// ─── TagConfig schema ────────────────────────────────────────────────
const tagConfigSchema = z
  .object({
    name: z.string().min(1, 'tag name cannot be empty'),
    address: z.string().min(1, 'tag address cannot be empty'),
    type: z.enum(DATA_TYPES, { message: 'invalid tag type' }),
    group: z.string().optional(),
    interval: durationString,
    scale: z.number().optional(),
    offset: z.number().optional(),
    deadband: z.number().optional(),
    'read-timeout': durationString,
  })
  .passthrough()

// ─── Driver settings: per-type required-field checks ─────────────────
// settings is a dynamic map (server: map[string]any); we keep it as a
// record and add conditional required-field validation via superRefine.
const driverSettingsSchema = z.record(z.string(), z.unknown()).default({})

const driverConfigSchema = z
  .object({
    name: z.string().min(1, 'driver name cannot be empty'),
    type: z.string().min(1, 'driver type cannot be empty'),
    settings: driverSettingsSchema,
    tags: z.array(tagConfigSchema).min(1, 'at least one tag must be configured'),
    'tags-file': z.string().optional(),
    'tags-interval': durationString,
  })
  .passthrough()
  .superRefine((d, ctx) => {
    const s = d.settings ?? {}
    const req = (field: string, label: string) => {
      const v = s[field]
      if (v === undefined || v === null || v === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', field],
          message: `${d.type}: ${label} is required`,
        })
      }
    }
    switch (d.type) {
      case 'modbus-tcp':
      case 'modbus-rtuovertcp':
      case 'modbus-udp':
      case 'modbus-rtuoverudp':
        req('host', 'host')
        break
      case 'modbus-rtu':
        req('serial-device', 'serial-device (e.g. /dev/ttyUSB0 or COM3)')
        break
      case 'modbus-tls':
        req('host', 'host')
        req('cert-file', 'cert-file (client certificate PEM)')
        req('key-file', 'key-file (client private key PEM)')
        req('ca-file', 'ca-file (CA / server certificate PEM)')
        break
      case 's7':
        req('host', 'host')
        break
      case 'opcua':
        req('endpoint', 'endpoint (e.g. opc.tcp://host:4840)')
        break
      default:
        // Unknown type — cross-entity validateConfig checks the registry.
        break
    }
    // parity enum check for modbus-rtu
    if (d.type === 'modbus-rtu' && s.parity !== undefined) {
      const p = String(s.parity)
      if (!PARITY_VALUES.includes(p as never)) {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', 'parity'],
          message: `parity must be one of: ${PARITY_VALUES.join(', ')}`,
        })
      }
    }
    // Tag name uniqueness within this driver
    const names = (d.tags ?? []).map((t) => t.name)
    const dupes = names.filter((n, i) => names.indexOf(n) !== i)
    if (dupes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['tags'],
        message: `duplicate tag name(s): ${[...new Set(dupes)].join(', ')}`,
      })
    }
  })

// ─── Transport settings ──────────────────────────────────────────────
const transportSettingsSchema = z.record(z.string(), z.unknown()).default({})

const transportConfigSchema = z
  .object({
    name: z.string().min(1, 'transport name cannot be empty'),
    type: z.string().min(1, 'transport type cannot be empty'),
    settings: transportSettingsSchema,
    'batch-size': z.number().int().positive().optional(),
    'flush-interval': durationString,
    'retry-count': z.number().int().nonnegative().optional(),
    'buffer-size': z.number().int().positive().optional(),
    fallback: z.string().optional(),
  })
  .passthrough()
  .superRefine((t, ctx) => {
    const s = t.settings ?? {}
    // Fail fast if batch/retry fields are misplaced inside settings
    // (server config.validate:235 — silent misconfiguration otherwise).
    const misplaced = [
      'batch-size',
      'batch_size',
      'flush-interval',
      'flush_interval',
      'retry-count',
      'retry_count',
      'buffer-size',
      'buffer_size',
      'fallback',
    ]
    for (const k of misplaced) {
      if (s[k] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', k],
          message: `field "${k}" must be a top-level transport field (sibling of settings), not inside settings`,
        })
      }
    }
    // Per-type required fields
    if (t.type === 'mqtt') {
      const broker = s.broker
      if (broker === undefined || broker === null || broker === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', 'broker'],
          message: 'mqtt: broker is required',
        })
      } else {
        // TLS scheme ↔ TLS files consistency (publisher.go:441)
        const brokerStr = String(broker)
        const isTlsScheme = /^(mqtts|ssl|tls|tcps|wss):\/\//.test(brokerStr)
        const hasTlsFiles = !!(s['tls-cert-file'] || s['tls-key-file'] || s['tls-ca-file'])
        if (hasTlsFiles && !isTlsScheme) {
          ctx.addIssue({
            code: 'custom',
            path: ['settings', 'broker'],
            message: `mqtt: TLS files configured but broker scheme is not TLS; use mqtts:// or ssl:// to enable TLS`,
          })
        }
      }
    }
    if (t.type === 'http') {
      const url = s.url
      const webhook = s['webhook-addr']
      const hasUrl = url !== undefined && url !== null && url !== ''
      const hasWebhook = webhook !== undefined && webhook !== null && webhook !== ''
      if (!hasUrl && !hasWebhook) {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', 'url'],
          message: 'http: either url or webhook-addr is required',
        })
      }
    }
    if (t.type === 'notify') {
      const channel = s.channel
      if (channel === undefined || channel === null || channel === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', 'channel'],
          message: 'notify: channel is required (slack|teams|email|webhook)',
        })
      } else {
        const ch = String(channel)
        const validChannels: readonly string[] = NOTIFY_CHANNELS
        if (!validChannels.includes(ch)) {
          ctx.addIssue({
            code: 'custom',
            path: ['settings', 'channel'],
            message: `notify: invalid channel "${ch}" (must be slack|teams|email|webhook)`,
          })
        }
        if (ch === 'slack' || ch === 'teams') {
          if (!s['webhook-url']) {
            ctx.addIssue({
              code: 'custom',
              path: ['settings', 'webhook-url'],
              message: `notify (${ch}): webhook-url is required`,
            })
          }
        }
        if (ch === 'email') {
          for (const field of ['smtp-host', 'from']) {
            if (!s[field]) {
              ctx.addIssue({
                code: 'custom',
                path: ['settings', field],
                message: `notify (email): ${field} is required`,
              })
            }
          }
          const to = s.to
          if (!Array.isArray(to) || to.length === 0) {
            ctx.addIssue({
              code: 'custom',
              path: ['settings', 'to'],
              message: 'notify (email): to (recipient list) is required',
            })
          }
        }
        if (ch === 'webhook') {
          if (!s.url) {
            ctx.addIssue({
              code: 'custom',
              path: ['settings', 'url'],
              message: 'notify (webhook): url is required',
            })
          }
        }
      }
    }
  })

// ─── Rule schema ─────────────────────────────────────────────────────
const transformConfigSchema = z
  .object({
    expression: z.string().min(1, 'transform expression cannot be empty'),
    'tag-rename': z.string().optional(),
  })
  .passthrough()

const ruleConfigSchema = z
  .object({
    name: z.string().min(1, 'rule name cannot be empty'),
    match: z.string().min(1, 'rule match cannot be empty'),
    action: z.enum(RULE_ACTIONS, {
      message: 'unknown action (valid: forward, drop, alert, transform, mirror)',
    }),
    target: z.string().optional(),
    targets: z.array(z.string()).optional(),
    priority: z.number().int().optional(),
    transform: transformConfigSchema.optional(),
    continue: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((r, ctx) => {
    if (r.action === 'transform' && !r.transform) {
      ctx.addIssue({
        code: 'custom',
        path: ['transform'],
        message: 'transform action requires a transform config with expression',
      })
    }
    if (r.action === 'mirror' && (!r.targets || r.targets.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'mirror action requires at least one target in targets[]',
      })
    }
    if (r.action === 'forward' && !r.target) {
      ctx.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'forward action requires a target transport name',
      })
    }
    // drop + continue is contradictory: drop means "discard and stop",
    // continue means "keep evaluating" (ADR-010, mirrors config/validate.go).
    if (r.action === 'drop' && r.continue === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['continue'],
        message: 'drop action cannot set continue: true (drop is terminal)',
      })
    }
  })

const ruleProviderConfigSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    path: z.string().min(1),
    interval: durationString,
  })
  .passthrough()

// ─── Global config schemas ───────────────────────────────────────────
const apiConfigSchema = z
  .object({
    listen: z.string().optional(),
    secret: z.string().optional(),
    'tls-cert': z.string().optional(),
    'tls-key': z.string().optional(),
    'allowed-origins': z.array(z.string()).optional(),
    'rate-limit-per-sec': z.number().int().positive().optional(),
    'read-header-timeout': durationString,
    'read-timeout': durationString,
    'write-timeout': durationString,
    'idle-timeout': durationString,
    'pprof-disabled': z.boolean().optional(),
    'pprof-addr': z.string().optional(),
  })
  .passthrough()
  .superRefine((a, ctx) => {
    // config.validate:199-208 — secret required (min 8 chars) when listen is set.
    if (a.listen) {
      if (!a.secret) {
        ctx.addIssue({
          code: 'custom',
          path: ['secret'],
          message: 'api.secret is required when api.listen is set',
        })
      } else if (a.secret.length < 8) {
        ctx.addIssue({
          code: 'custom',
          path: ['secret'],
          message: `api.secret must be at least 8 characters, got ${a.secret.length}`,
        })
      }
    }
    // TLS cert/key must be paired (server: ListenAndServeTLS requires both).
    if (!a['tls-cert'] !== !a['tls-key']) {
      ctx.addIssue({
        code: 'custom',
        path: ['tls-cert'],
        message: 'api.tls-cert and api.tls-key must be set together (or both omitted)',
      })
    }
  })

const engineConfigSchema = z
  .object({
    'data-bus-size': z.number().int().positive().optional(),
    workers: z.number().int().nonnegative().optional(),
    'shutdown-timeout': durationString,
    'error-throttle-window': durationString,
    'default-tag-interval': durationString,
    'on-bad-quality': z.enum(ON_BAD_QUALITY_POLICIES).optional(),
    'stale-threshold': durationString,
    'write-retry-count': z.number().int().nonnegative().optional(),
    'command-concurrency': z.number().int().positive().optional(),
    'high-priority-workers': z.number().int().nonnegative().optional(),
  })
  .passthrough()

const bufferConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    'max-size': z.number().int().optional(),
    path: z.string().optional(),
  })
  .passthrough()
  .superRefine((b, ctx) => {
    // config.validate:106-113
    if (b.enabled) {
      if (!b.path) {
        ctx.addIssue({
          code: 'custom',
          path: ['path'],
          message: 'buffer.path is not set but buffer.enabled is true',
        })
      }
      if (b['max-size'] !== undefined && b['max-size'] > 0 && b['max-size'] < 10) {
        ctx.addIssue({
          code: 'custom',
          path: ['max-size'],
          message: `buffer.max-size must be at least 10, got ${b['max-size']}`,
        })
      }
    }
  })

const globalConfigSchema = z
  .object({
    'log-level': z.enum(LOG_LEVELS).optional(),
    // CoreC returns "" when log-format is unset (defaults to text at runtime).
    // z.enum rejects "" — treat it as equivalent to "unset" (optional).
    'log-format': z.enum(LOG_FORMATS).or(z.literal('')).optional(),
    api: apiConfigSchema.optional(),
    engine: engineConfigSchema.optional(),
    buffer: bufferConfigSchema.optional(),
  })
  .passthrough()

const nodeConfigSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(NODE_ROLES).optional(),
    subscribe: z.array(z.string()).optional(),
    'topic-prefix': z.string().optional(),
  })
  .passthrough()

// ─── Top-level config schema (shape only; cross-entity via validateConfig) ──
// ─── Derived tag schema ──────────────────────────────────────────────

export const derivedTagConfigSchema = z.object({
  name: z.string().min(1, { message: 'derived tag name is required' }),
  expr: z.string().min(1, { message: 'expr is required' }),
  type: z.enum(DATA_TYPES, { message: 'invalid tag type' }),
  group: z.string().optional(),
  interval: requiredDuration,
  unit: z.string().optional(),
  'on-missing': z.enum(ON_MISSING_POLICIES).optional(),
  'stale-guard': durationString,
})

export const coreCConfigSchema = z
  .object({
    node: nodeConfigSchema.optional(),
    global: globalConfigSchema.optional(),
    drivers: z.array(driverConfigSchema).optional(),
    transports: z.array(transportConfigSchema).optional(),
    rules: z.array(ruleConfigSchema).optional(),
    'rule-providers': z.array(ruleProviderConfigSchema).optional(),
    'rule-groups': z.record(z.string(), z.array(ruleConfigSchema)).optional(),
    'derived-tags': z.array(derivedTagConfigSchema).optional(),
  })
  .passthrough()
