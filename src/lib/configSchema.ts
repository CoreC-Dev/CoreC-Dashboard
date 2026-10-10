/**
 * CoreC Configuration Validation Schemas (zod).
 *
 * Mirrors the server-side validation in CoreC's `config.validate()`
 * (config/config.go:104) plus the per-driver/transport Init-time required
 * field checks. This gives the Dashboard front-end fail-fast validation
 * identical to the server, so invalid configs are caught before the
 * PUT /configs hot-reload (which is non-atomic and can half-apply).
 *
 * Two layers:
 *   1. Per-entity zod schemas (shape + intra-entity conditional rules)
 *   2. validateConfig() — cross-entity rules (name uniqueness, target
 *      references, data-source presence) that zod schemas alone can't express.
 *
 * Source of truth (verified against /workspace/codespace/CoreC):
 *   config/config.go            validate() — buffer/api/tag/driver/transport/rule rules
 *   driver/modbus/tcp.go:47     modbus-tcp: host required
 *   driver/modbus/rtu.go:53     modbus-rtu: serial-device required
 *   driver/modbus/tls.go:62-76  modbus-tls: cert/key/ca all required (mTLS)
 *   driver/s7/s7.go:119         s7: host required
 *   driver/opcua/client.go:102  opcua: endpoint required
 *   transport/mqtt/publisher.go:220,441  mqtt: broker required; TLS scheme↔files consistency
 *   transport/httppush/push.go:183       http: url or webhook-addr required
 */
import { z } from 'zod'
import {
  DATA_TYPES,
  DRIVER_TYPES,
  LOG_FORMATS,
  LOG_LEVELS,
  NODE_ROLES,
  ON_BAD_QUALITY_POLICIES,
  PARITY_VALUES,
  RULE_ACTIONS,
  SECRET_SENTINEL,
  TRANSPORT_TYPES,
} from '@/types/config'

// ─── Go duration validation ──────────────────────────────────────────
// Go's time.ParseDuration accepts e.g. "300ms", "1.5h", "2h45m", "500us".
// Format: optional sign, then one or more (float + unit) where unit ∈
// {ns, µs, us, ms, s, m, h}. A leading "0" means zero (rejected as <=0).
// One or more (number + unit) segments, where unit ∈ {ns,µs,us,ms,s,m,h}.
// Matches "30s", "1.5h", "2h45m", "500ms", "10us". A bare "0" is zero (rejected below).
const GO_DURATION_RE = /^[+-]?([0-9]+(\.[0-9]+)?(ns|µs|us|ms|s|m|h))+$/

/** True when every numeric segment in the duration is zero (e.g. "0", "0s", "0h0m"). */
function isZeroDuration(v: string): boolean {
  const nums = v.replace(/^[+-]?/, '').match(/[0-9]+(\.[0-9]+)?/g) ?? []
  return nums.length > 0 && nums.every((n) => Number.parseFloat(n) === 0)
}

/** True when `v` is a valid Go duration string (> 0). Empty string is allowed (means unset). */
export function isValidGoDuration(v: string | undefined): boolean {
  if (!v) return true // empty = unset, valid (server uses default)
  if (!GO_DURATION_RE.test(v)) return false
  // Zero duration (e.g. "0s", "0h0m0s") is rejected by server (dur <= 0).
  if (isZeroDuration(v)) return false
  return true
}

const durationString = z
  .string()
  .superRefine((v, ctx) => {
    if (!v) return
    if (!isValidGoDuration(v)) {
      ctx.addIssue({
        code: 'custom',
        message: `"${v}" is not a valid positive Go duration (e.g. "30s", "500ms", "1h30m")`,
      })
    }
  })
  .optional()

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
      } else if (a.secret !== SECRET_SENTINEL && a.secret.length < 8) {
        // SECRET_SENTINEL ("***") marks an unchanged secret redacted by
        // GET /configs/raw — the backend's MergeSentinels restores the real
        // value before its own validate, so accept it locally. Only reject
        // genuinely short user-entered values.
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
    // z.enum rejects "" — treat it as equivalent to "unset" (optional). [C-2 follow-up]
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
export const coreCConfigSchema = z
  .object({
    node: nodeConfigSchema.optional(),
    global: globalConfigSchema.optional(),
    drivers: z.array(driverConfigSchema).optional(),
    transports: z.array(transportConfigSchema).optional(),
    rules: z.array(ruleConfigSchema).optional(),
    'rule-providers': z.array(ruleProviderConfigSchema).optional(),
    'rule-groups': z.record(z.string(), z.array(ruleConfigSchema)).optional(),
  })
  .passthrough()

// ─── Cross-entity validation (mirrors config.validate cross-cutting rules) ──
interface ConfigValidationError {
  path: string
  message: string
}

export interface ConfigValidationResult {
  valid: boolean
  errors: ConfigValidationError[]
}

/** Inbound transport: mqtt with data-topic, or http with webhook-addr. */
function isInboundTransport(t: { settings?: Record<string, unknown> }): boolean {
  const s = t.settings ?? {}
  const dt = s['data-topic']
  if (typeof dt === 'string' && dt !== '') return true
  const wa = s['webhook-addr']
  if (typeof wa === 'string' && wa !== '') return true
  return false
}

function hasAutoDiscoveryInbound(node: { id?: string; subscribe?: string[] } | undefined): boolean {
  return !!node?.id && !!node?.subscribe && node.subscribe.length > 0
}

/**
 * Check that each rule's target / targets reference an existing transport.
 * Returns the produced errors (in iteration order); byte-identical to the
 * inline loops previously duplicated for top-level `rules` and `rule-groups`.
 * `pathFor(ruleName)` yields the path prefix (without the trailing
 * `.target`/`.targets`), e.g. `rules[foo]` or `rule-groups[g].foo`.
 */
function checkRuleTargetRefs(
  rules: { name: string; target?: string; targets?: string[] }[],
  transportNames: Set<string>,
  pathFor: (ruleName: string) => string,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []
  for (const r of rules) {
    if (r.target && !transportNames.has(r.target)) {
      errors.push({
        path: `${pathFor(r.name)}.target`,
        message: `target transport "${r.target}" not found`,
      })
    }
    for (const tgt of r.targets ?? []) {
      if (!transportNames.has(tgt)) {
        errors.push({
          path: `${pathFor(r.name)}.targets`,
          message: `target transport "${tgt}" not found`,
        })
      }
    }
  }
  return errors
}

/** Structural shape used by the cross-entity validators. */
type CrossEntityConfig = {
  node?: { id?: string; subscribe?: string[] }
  drivers?: { name: string; type: string; tags?: { name: string }[] }[]
  transports?: {
    name: string
    type: string
    settings?: Record<string, unknown>
    fallback?: string
  }[]
  rules?: { name: string; target?: string; targets?: string[] }[]
  'rule-groups'?: Record<
    string,
    { name: string; match?: string; target?: string; targets?: string[] }[]
  >
}

/** At least one data source: a driver, an inbound transport, or auto-discovery. */
function checkDataSourcePresence(
  drivers: { name: string; type: string }[],
  transports: { settings?: Record<string, unknown> }[],
  node: { id?: string; subscribe?: string[] } | undefined,
): ConfigValidationError[] {
  if (
    drivers.length === 0 &&
    !transports.some(isInboundTransport) &&
    !hasAutoDiscoveryInbound(node)
  ) {
    return [
      {
        path: 'drivers',
        message:
          'no data source: configure at least one driver, or an inbound transport (mqtt data-topic / http webhook-addr), or enable auto-discovery with node.subscribe',
      },
    ]
  }
  return []
}

/** At least one transport must be configured. */
function checkTransportPresence(transports: { name: string }[]): ConfigValidationError[] {
  if (transports.length === 0) {
    return [{ path: 'transports', message: 'at least one transport must be configured' }]
  }
  return []
}

/** Driver name uniqueness + type registry (config.validate:139-155). */
function checkDriverNames(drivers: { name: string; type: string }[]): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []
  const driverNames = new Set<string>()
  for (const d of drivers) {
    if (driverNames.has(d.name)) {
      errors.push({ path: `drivers[${d.name}]`, message: `duplicate driver name: ${d.name}` })
    }
    driverNames.add(d.name)
    if (DRIVER_TYPES.length > 0 && !DRIVER_TYPES.includes(d.type as never)) {
      errors.push({
        path: `drivers[${d.name}].type`,
        message: `unknown driver type "${d.type}" (registered: ${DRIVER_TYPES.join(', ')})`,
      })
    }
  }
  return errors
}

/** Transport name uniqueness + type registry (config.validate:210-226). */
function checkTransportNames(transports: { name: string; type: string }[]): {
  names: Set<string>
  errors: ConfigValidationError[]
} {
  const errors: ConfigValidationError[] = []
  const names = new Set<string>()
  for (const t of transports) {
    if (names.has(t.name)) {
      errors.push({ path: `transports[${t.name}]`, message: `duplicate transport name: ${t.name}` })
    }
    names.add(t.name)
    if (TRANSPORT_TYPES.length > 0 && !TRANSPORT_TYPES.includes(t.type as never)) {
      errors.push({
        path: `transports[${t.name}].type`,
        message: `unknown transport type "${t.type}" (registered: ${TRANSPORT_TYPES.join(', ')})`,
      })
    }
  }
  return { names, errors }
}

/** Transport fallback must reference an existing, distinct transport. */
function checkTransportFallbacks(
  transports: { name: string; fallback?: string }[],
  transportNames: Set<string>,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []
  for (const t of transports) {
    if (t.fallback && !transportNames.has(t.fallback)) {
      errors.push({
        path: `transports[${t.name}].fallback`,
        message: `fallback transport "${t.fallback}" not found`,
      })
    }
    // Self-fallback is a no-op (transport falls back to itself = infinite loop)
    if (t.fallback && t.fallback === t.name) {
      errors.push({
        path: `transports[${t.name}].fallback`,
        message: `fallback transport cannot be itself ("${t.name}")`,
      })
    }
  }
  return errors
}

/**
 * Rule groups: validate target refs inside group rules + detect circular
 * SUB-RULE references via DFS (mirrors rule/engine.go:98-112
 * detectCircularSubRules). A rule's match field can be "SUB-RULE:group-name"
 * to delegate to a named sub-rule group; circular chains (A→B→A) are caught.
 */
function checkSubRuleCycles(
  ruleGroups: Record<
    string,
    { name: string; match?: string; target?: string; targets?: string[] }[]
  >,
  transportNames: Set<string>,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []
  const groupNames = Object.keys(ruleGroups)
  if (groupNames.length === 0) return errors

  // Validate target references inside group rules
  for (const [groupName, groupRules] of Object.entries(ruleGroups)) {
    errors.push(
      ...checkRuleTargetRefs(
        groupRules ?? [],
        transportNames,
        (name) => `rule-groups[${groupName}].${name}`,
      ),
    )
  }

  // Detect circular SUB-RULE references via DFS
  const SUB_RULE_PREFIX = 'SUB-RULE:'
  const visited = new Set<string>()
  const inStack = new Set<string>()

  const detectCycle = (name: string, chain: string[]): boolean => {
    if (inStack.has(name)) {
      errors.push({
        path: `rule-groups[${name}]`,
        message: `circular sub-rule reference: ${chain.join(' -> ')} -> ${name}`,
      })
      return true
    }
    if (visited.has(name)) return false
    visited.add(name)
    inStack.add(name)

    const groupRules = ruleGroups[name] ?? []
    let foundCycle = false
    for (const r of groupRules) {
      const matchUpper = (r.match ?? '').toUpperCase()
      if (matchUpper.startsWith(SUB_RULE_PREFIX)) {
        const refName = (r.match ?? '').slice(SUB_RULE_PREFIX.length).trim()
        if (ruleGroups[refName] !== undefined) {
          if (detectCycle(refName, [...chain, name])) {
            foundCycle = true
            break
          }
        } else {
          // Reference to non-existent group
          errors.push({
            path: `rule-groups[${name}].${r.name}.match`,
            message: `SUB-RULE references non-existent group "${refName}"`,
          })
        }
      }
    }

    // Always unwind inStack — even when a cycle was found in a child — so
    // stale entries don't trigger false cycle reports for later top-level
    // iterations that reference this node. [M-6]
    inStack.delete(name)
    return foundCycle
  }

  for (const name of groupNames) {
    if (!visited.has(name)) {
      detectCycle(name, [])
    }
  }
  return errors
}

/**
 * Validate cross-entity consistency rules that zod schemas can't express.
 * Run this AFTER schema.parse() succeeds (shape/intra-entity checks pass).
 * Mirrors config.validate:122-272. Delegates to named pure validators so
 * each cross-entity rule is testable in isolation.
 */
export function validateConfig(config: unknown): ConfigValidationResult {
  const cfg = config as CrossEntityConfig
  const drivers = cfg.drivers ?? []
  const transports = cfg.transports ?? []
  const rules = cfg.rules ?? []
  const ruleGroups = cfg['rule-groups'] ?? {}

  const errors: ConfigValidationError[] = []
  errors.push(...checkDataSourcePresence(drivers, transports, cfg.node))
  errors.push(...checkTransportPresence(transports))
  errors.push(...checkDriverNames(drivers))
  const { names: transportNames, errors: transportNameErrors } = checkTransportNames(transports)
  errors.push(...transportNameErrors)
  errors.push(...checkTransportFallbacks(transports, transportNames))
  errors.push(...checkRuleTargetRefs(rules, transportNames, (name) => `rules[${name}]`))
  errors.push(...checkSubRuleCycles(ruleGroups, transportNames))

  return { valid: errors.length === 0, errors }
}

/**
 * Full validation: run zod schema parse (shape + intra-entity) then
 * cross-entity validateConfig. Returns all errors found.
 */
export function validateFullConfig(config: unknown): ConfigValidationResult {
  const schemaErrors: ConfigValidationError[] = []
  const parsed = coreCConfigSchema.safeParse(config)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      schemaErrors.push({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })
    }
    // Still run cross-entity checks on the raw input to collect all errors.
  }
  const cross = validateConfig(config)
  const errors = [...schemaErrors, ...cross.errors]
  return { valid: errors.length === 0, errors }
}
