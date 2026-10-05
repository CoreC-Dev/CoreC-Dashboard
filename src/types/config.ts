/**
 * CoreC Configuration Type System
 *
 * 1:1 mapping from CoreC Go structs. Property names use the exact YAML tag
 * strings (kebab-case) from the server so that `js-yaml.dump(config)`
 * round-trips to a YAML document the CoreC parser accepts unchanged.
 *
 * Source structs (verified against /workspace/codespace/CoreC):
 *   core/engine.go   → Config, NodeConfig, GlobalConfig, EngineConfig, APIConfig, BufferConfig
 *   core/types.go    → TagConfig, DataType
 *   core/driver.go   → DriverConfig
 *   core/transport.go→ TransportConfig
 *   core/rule.go     → RuleConfig, RuleProviderConfig, TransformConfig
 *
 * Per-protocol `settings` interfaces are derived from config.example.yaml
 * and the setting keys actually read by each driver/transport implementation.
 * The server stores settings as `map[string]any`; the structural types below
 * keep `settings: Record<string, unknown>` for round-trip honesty, while the
 * `*Settings` interfaces model known fields for type-safe form rendering.
 */

// ─── Data types (core/types.go) ─────────────────────────────────────
export const DATA_TYPES = [
  'bool',
  'int8',
  'int16',
  'int32',
  'int64',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
  'float32',
  'float64',
  'string',
  'bytes',
] as const
export type DataType = (typeof DATA_TYPES)[number]
/** Canonical alias — historically in lib/constants, moved to types/ to break types↔lib cycle (TD-ARCH-001). */
export type DataTypeString = DataType

// ─── Driver / transport / rule enumerations ──────────────────────────
// Registered types (core/registry.go + driver/all, transport/all).
export const DRIVER_TYPES = [
  'modbus-tcp',
  'modbus-rtu',
  'modbus-rtuovertcp',
  'modbus-udp',
  'modbus-rtuoverudp',
  'modbus-tls',
  's7',
  'opcua',
] as const
export type DriverType = (typeof DRIVER_TYPES)[number]

export const TRANSPORT_TYPES = ['mqtt', 'http'] as const
export type TransportType = (typeof TRANSPORT_TYPES)[number]

export const RULE_ACTIONS = ['forward', 'drop', 'alert', 'transform', 'mirror'] as const
export type RuleAction = (typeof RULE_ACTIONS)[number]

export const LOG_LEVELS = ['debug', 'info', 'warn', 'warning', 'error', 'silent'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

export const LOG_FORMATS = ['text', 'json'] as const
type LogFormat = (typeof LOG_FORMATS)[number]

export const ON_BAD_QUALITY_POLICIES = ['publish', 'drop', 'mark-and-publish', 'alert'] as const

export const NODE_ROLES = ['collector', 'relay', 'aggregator', 'sink'] as const

export const PARITY_VALUES = ['none', 'even', 'odd'] as const

// ─── TagConfig (core/types.go:213) ───────────────────────────────────
export interface TagConfig {
  name: string
  address: string
  type: DataType
  group?: string
  interval?: string
  scale?: number
  offset?: number
  deadband?: number
  /** Per-tag read timeout, independent of interval. Empty = fallback to interval. */
  'read-timeout'?: string
}

// ─── DriverConfig (core/driver.go:33) ────────────────────────────────
export interface DriverConfig {
  name: string
  type: DriverType | string
  /**
   * Opaque settings map (server: map[string]any). Kept as Record for
   * round-trip fidelity; cast to the protocol-specific interface when
   * rendering/editing a known type.
   */
  settings: Record<string, unknown>
  tags: TagConfig[]
  /** External tags YAML file; inline tags are appended after file tags. */
  'tags-file'?: string
  /** Hot-reload interval for the tags file (e.g. "30s"). Empty = load once. */
  'tags-interval'?: string
}

// ─── TransportConfig (core/transport.go:50) ──────────────────────────
// NOTE: batch-size / flush-interval / retry-count / buffer-size / fallback
// are TOP-LEVEL fields (siblings of `settings`), NOT entries inside settings.
// config.validate fails fast if they are misplaced inside settings.
export interface TransportConfig {
  name: string
  type: TransportType | string
  settings: Record<string, unknown>
  'batch-size'?: number
  'flush-interval'?: string
  'retry-count'?: number
  /** Command/data channel capacity (default 100). */
  'buffer-size'?: number
  /** Fallback transport name used when this transport fails to publish. */
  fallback?: string
}

// ─── Rule config (core/rule.go) ──────────────────────────────────────
interface TransformConfig {
  /** Arithmetic expression: supports +, -, *, /, parens, and variable `value`. */
  expression: string
  /** Optional literal new tag name (not a template). */
  'tag-rename'?: string
}

export interface RuleConfig {
  name: string
  /** Match DSL expression, or "ALL", or "RULE-SET:name" / "SUB-RULE:name". */
  match: string
  action: RuleAction | string
  /** Single target transport name (forward/alert/transform). */
  target?: string
  /** Multiple target transport names (mirror). */
  targets?: string[]
  /** Lower number = higher priority. */
  priority?: number
  /** Required when action === 'transform'. */
  transform?: TransformConfig
}

export interface RuleProviderConfig {
  name: string
  /** Currently only "file". */
  type: string
  path: string
  /** Hot-reload interval (e.g. "30s"). */
  interval?: string
}

/** rule-groups: named, reusable sub-rule groups keyed by group name. */
type RuleGroups = Record<string, RuleConfig[]>

// ─── Global config (core/engine.go) ──────────────────────────────────
interface APIConfig {
  listen?: string
  /** Shared secret for management API auth. Min 8 chars when listen is set. */
  secret?: string
  'tls-cert'?: string
  'tls-key'?: string
  'allowed-origins'?: string[]
  'rate-limit-per-sec'?: number
  'read-header-timeout'?: string
  'read-timeout'?: string
  'write-timeout'?: string
  'idle-timeout'?: string
  'pprof-disabled'?: boolean
  /** Separate unauthenticated pprof port (bind to loopback only). */
  'pprof-addr'?: string
}

interface EngineConfig {
  'data-bus-size'?: number
  /** 0 = runtime.NumCPU(). */
  workers?: number
  'shutdown-timeout'?: string
  'error-throttle-window'?: string
  'default-tag-interval'?: string
  'on-bad-quality'?: (typeof ON_BAD_QUALITY_POLICIES)[number] | string
  'stale-threshold'?: string
  'write-retry-count'?: number
  'command-concurrency'?: number
  'high-priority-workers'?: number
}

interface BufferConfig {
  enabled?: boolean
  /** Max buffered batches; <=0 defaults to 10000. Must be >= 10 when > 0. */
  'max-size'?: number
  /** Buffer file directory — required when enabled=true. */
  path?: string
}

export interface GlobalConfig {
  'log-level'?: LogLevel | string
  'log-format'?: LogFormat | string
  api?: APIConfig
  engine?: EngineConfig
  buffer?: BufferConfig
}

export interface NodeConfig {
  /** Unique node identifier; enables auto-discovery when set. */
  id?: string
  role?: (typeof NODE_ROLES)[number] | string
  /** Upstream node IDs to receive from (relay/sink only). */
  subscribe?: string[]
  /** Default "topo"; auto topics use {prefix}/{node-id}/data/... */
  'topic-prefix'?: string
}

// ─── Top-level Config (core/engine.go:142) ───────────────────────────
export interface CoreCConfig {
  node?: NodeConfig
  global?: GlobalConfig
  drivers?: DriverConfig[]
  transports?: TransportConfig[]
  rules?: RuleConfig[]
  'rule-providers'?: RuleProviderConfig[]
  'rule-groups'?: RuleGroups
}
