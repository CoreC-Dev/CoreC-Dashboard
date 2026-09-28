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

export const RULE_TYPES = ['simple', 'rule-set', 'sub-rule'] as const
export type RuleType = (typeof RULE_TYPES)[number]

export const LOG_LEVELS = ['debug', 'info', 'warn', 'warning', 'error', 'silent'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export const LOG_FORMATS = ['text', 'json'] as const
export type LogFormat = (typeof LOG_FORMATS)[number]

export const ON_BAD_QUALITY_POLICIES = ['publish', 'drop', 'mark-and-publish', 'alert'] as const
export type OnBadQualityPolicy = (typeof ON_BAD_QUALITY_POLICIES)[number]

export const NODE_ROLES = ['collector', 'relay', 'aggregator', 'sink'] as const
export type NodeRole = (typeof NODE_ROLES)[number]

export const OPCUA_MODES = ['polling', 'subscription'] as const
export type OpcuaMode = (typeof OPCUA_MODES)[number]

export const PARITY_VALUES = ['none', 'even', 'odd'] as const
export type Parity = (typeof PARITY_VALUES)[number]

export const PARSER_TYPES = ['default', 'jsonpath', 'raw'] as const
export type ParserType = (typeof PARSER_TYPES)[number]

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

// ─── Per-protocol driver settings ────────────────────────────────────
// Common reconnect fields shared by modbus/s7/opcua.
export interface ReconnectSettings {
  'reconnect-interval'?: string
  'reconnect-max-interval'?: string
  /** Circuit-breaker threshold: consecutive failures before cool-down. */
  'max-reconnect-failures'?: number
}

export interface ModbusTcpSettings extends ReconnectSettings {
  host?: string
  port?: number
  'slave-id'?: number
  timeout?: string
  retry?: number
  [k: string]: unknown
}

export interface ModbusRtuSettings extends ReconnectSettings {
  'serial-device'?: string
  'baud-rate'?: number
  'data-bits'?: number
  parity?: Parity
  'stop-bits'?: number
  'slave-id'?: number
  timeout?: string
  retry?: number
  [k: string]: unknown
}

export interface ModbusRtuOverTcpSettings extends ReconnectSettings {
  host?: string
  port?: number
  'slave-id'?: number
  timeout?: string
  [k: string]: unknown
}

export interface ModbusUdpSettings extends ReconnectSettings {
  host?: string
  port?: number
  'slave-id'?: number
  timeout?: string
  [k: string]: unknown
}

export interface ModbusRtuOverUdpSettings extends ReconnectSettings {
  host?: string
  port?: number
  'slave-id'?: number
  timeout?: string
  [k: string]: unknown
}

/** Modbus TCP over TLS — requires mutual-TLS certificate triple. */
export interface ModbusTlsSettings extends ReconnectSettings {
  host?: string
  port?: number
  /** Client certificate PEM — required for mTLS. */
  'cert-file'?: string
  /** Client private key PEM — required, must pair with cert-file. */
  'key-file'?: string
  /** CA / server certificate PEM — required for server verification. */
  'ca-file'?: string
  'slave-id'?: number
  timeout?: string
  [k: string]: unknown
}

export interface S7Settings extends ReconnectSettings {
  host?: string
  port?: number
  rack?: number
  /** Rack 0 Slot 2 for S7-300, Slot 1 for S7-1200/1500. */
  slot?: number
  timeout?: string
  'idle-timeout'?: string
  [k: string]: unknown
}

export interface OpcuaSettings extends ReconnectSettings {
  endpoint?: string
  /** polling | subscription. Determines whether subscription-* fields apply. */
  mode?: OpcuaMode
  'security-policy'?: string
  'security-mode'?: string
  username?: string
  password?: string
  /** Enables mTLS / SignAndEncrypt; must pair with key-file. */
  'cert-file'?: string
  'key-file'?: string
  timeout?: string
  /** subscription publish interval (mode=subscription only, default 500ms). */
  'subscription-interval'?: string
  'subscription-buffer'?: number
  /** Max nodes per read request (default 1000). */
  'max-batch-size'?: number
  [k: string]: unknown
}

/** Union of all driver settings; discriminator is the parent DriverConfig.type. */
export type DriverSettings =
  | ModbusTcpSettings
  | ModbusRtuSettings
  | ModbusRtuOverTcpSettings
  | ModbusUdpSettings
  | ModbusRtuOverUdpSettings
  | ModbusTlsSettings
  | S7Settings
  | OpcuaSettings

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

// ─── Per-transport settings ──────────────────────────────────────────
export interface ParserConfig {
  type: ParserType
  // jsonpath fields
  driver?: string
  tag?: string
  value?: string
  'data-type'?: DataType
  group?: string
  timestamp?: string
  'timestamp-format'?: string
  // raw fields
  'tag-from-topic'?: number
  [k: string]: unknown
}

export interface MqttSettings {
  broker?: string
  'client-id'?: string
  username?: string
  password?: string
  /** TLS scheme in broker URL (mqtts://, ssl://, tls://, tcps://, wss://) enables encryption. */
  'tls-ca-file'?: string
  'tls-cert-file'?: string
  'tls-key-file'?: string
  qos?: number
  'topic-template'?: string
  'command-topic'?: string
  'command-secret'?: string
  'command-max-skew'?: string
  'command-strict-replay'?: boolean
  'command-forward-topic'?: string
  'command-forward-secret'?: string
  /** Chained-core inbound: subscribe to upstream data. */
  'data-topic'?: string
  parser?: ParserConfig
  'clean-session'?: boolean
  retained?: boolean
  'keep-alive'?: string
  'connect-timeout'?: string
  'publish-timeout'?: string
  'subscribe-timeout'?: string
  'disconnect-quiesce'?: string
  'connect-retry-interval'?: string
  'auto-reconnect'?: boolean
  'connect-retry'?: boolean
  [k: string]: unknown
}

export interface HttpSettings {
  /** Outbound push URL. Mutually exclusive with webhook-addr. */
  url?: string
  method?: string
  headers?: Record<string, string>
  timeout?: string
  /** Chained-core inbound: start a webhook server to receive data. */
  'webhook-addr'?: string
  'webhook-path'?: string
  'webhook-secret'?: string
  'tls-cert-file'?: string
  'tls-key-file'?: string
  parser?: ParserConfig
  'max-idle-conns'?: number
  'max-idle-conns-per-host'?: number
  'idle-conn-timeout'?: string
  [k: string]: unknown
}

export type TransportSettings = MqttSettings | HttpSettings

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
export interface TransformConfig {
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
export type RuleGroups = Record<string, RuleConfig[]>

// ─── Global config (core/engine.go) ──────────────────────────────────
export interface APIConfig {
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

export interface EngineConfig {
  'data-bus-size'?: number
  /** 0 = runtime.NumCPU(). */
  workers?: number
  'shutdown-timeout'?: string
  'error-throttle-window'?: string
  'default-tag-interval'?: string
  'on-bad-quality'?: OnBadQualityPolicy | string
  'stale-threshold'?: string
  'write-retry-count'?: number
  'command-concurrency'?: number
  'high-priority-workers'?: number
}

export interface BufferConfig {
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
  role?: NodeRole | string
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

// ─── Type-guard / cast helpers for settings ──────────────────────────
export function asModbusTcp(s: Record<string, unknown>): ModbusTcpSettings {
  return s as ModbusTcpSettings
}
export function asModbusRtu(s: Record<string, unknown>): ModbusRtuSettings {
  return s as ModbusRtuSettings
}
export function asModbusTls(s: Record<string, unknown>): ModbusTlsSettings {
  return s as ModbusTlsSettings
}
export function asS7(s: Record<string, unknown>): S7Settings {
  return s as S7Settings
}
export function asOpcua(s: Record<string, unknown>): OpcuaSettings {
  return s as OpcuaSettings
}
export function asMqtt(s: Record<string, unknown>): MqttSettings {
  return s as MqttSettings
}
export function asHttp(s: Record<string, unknown>): HttpSettings {
  return s as HttpSettings
}
