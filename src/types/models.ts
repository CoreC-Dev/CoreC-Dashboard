import type { DataTypeString, RuleAction } from '@/types/config'

export interface DataPoint {
  driver: string
  device?: string
  group?: string
  tag: string
  value: unknown
  type: DataTypeString
  quality: number // 0=Good, 1=Bad, 2=Uncertain
  timestamp: string // ISO 8601 string
  metadata?: Record<string, string>
  is_stale?: boolean
}

export interface WriteCommand {
  driver: string
  device?: string
  tag: string
  /** Engineering value by default; the backend inverts the tag's scale/offset before encoding. */
  value: unknown
  type: DataTypeString | number
  /**
   * Optional escape hatch (audit DRV-1): when true the backend writes the
   * device-side raw representation as-is, skipping the scale/offset
   * inversion. Default false — UI flows send engineering values.
   */
  raw?: boolean
}

export interface DriverStatus {
  name: string
  type: string
  state: number // 0=Disconnected, 1=Connecting, 2=Connected, 3=Error
  last_read: string
  last_error: string
  tag_count: number
  read_count: number
  error_count: number
  reconnect_count: number
}

export interface TransportStatus {
  name: string
  type: string
  state: number // 0=Disconnected, 1=Connecting, 2=Connected, 3=Error
  published: number
  failed: number
  received: number
  last_publish: string
  queue_size: number
  dropped_commands: number
}

export interface RuleStat {
  index: number
  name: string
  type: 'simple' | 'rule-set' | 'sub-rule'
  match: string
  action: RuleAction
  target: string
  // CoreC serializes targets as null (not []) when empty.
  targets: string[] | null
  priority: number
  /** iptables-style continue flag (ADR-010). */
  continue: boolean
  disabled: boolean
  hit_count: number
  hit_at: string
  miss_count: number
  miss_at: string
  /**
   * Match-expression EVALUATION failures (e.g. value > 90 against a
   * string). Non-zero means the rule never matches on those points and
   * previously gave no signal at all (backend audit PIPE-3/RULE-2).
   */
  eval_errors: number
  eval_at: string
}

export interface DeadLetterEntry {
  command: WriteCommand
  error: string
  failed_at: string
  attempts: number
  /**
   * Present only on ingress drops (GET /write/failed?source=ingress):
   * the transport that dropped the command (e.g. the MQTT transport
   * whose command channel was full). Absent on engine dead letters.
   */
  transport?: string
}

export interface EngineStats {
  status: string
  uptime: number // nanoseconds
  drivers: number
  transports: number
  rules: number
  total_read: number
  total_publish: number
  total_errors: number
  total_dropped: number
  points_per_sec: number
  driver_stats?: Record<string, unknown>
  transport_stats?: Record<string, unknown>
}

export interface LogEvent {
  // Numeric contract: -8=debug, 0=info, 4=warn, 8=error (slog values).
  // The backend marshals levels as STRINGS ("WARN"); normalize at the
  // WS boundary via logEventSchema (types/api.ts) — audit F1.
  level: number
  type: string
  payload: string
  timestamp: string
}

/**
 * A first-class rule alert from the engine's registry (backend
 * core.Alert; audit OBS-4/HUB-6 — alerts previously had to be
 * reconstructed from log lines). Identity is rule|driver|tag: the same
 * rule firing on the same tag updates Count/LastFired instead of
 * duplicating.
 */
export interface Alert {
  /** Stable identity "rule|driver|tag" — used for ack and dedup. */
  key: string
  rule: string
  driver: string
  tag: string
  value?: unknown
  /** 0=Good, 1=Bad, 2=Uncertain (same vocabulary as DataPoint). */
  quality: number
  first_fired: string
  last_fired: string
  /** Fires while active (deduplicated by identity). */
  count: number
  /** Operator acknowledged; sticks until the alert clears. */
  acked: boolean
  acked_at?: string
}

/** Alert lifecycle transitions streamed over WS /alerts/stream. */
export interface AlertEvent {
  type: 'fired' | 'acked' | 'cleared'
  alert: Alert
  at: string
}

export interface TrafficFrame {
  /**
   * Rate mode (default, backend roadmap #32): per-second rates,
   * server-side diffed — read_rate carries the engine's 60s windowed
   * rate on the first frame (no baseline), never a negative spike.
   */
  read_rate?: number
  publish_rate?: number
  dropped_rate?: number
  /** Totals mode (?mode=totals): cumulative counters (legacy diff consumers). */
  read?: number
  publish?: number
  dropped?: number
  timestamp?: number
}

export interface MemoryFrame {
  alloc: number
  total_alloc: number
  sys: number
  num_gc: number
  goroutines: number
  timestamp?: number
}

/**
 * A saved CoreC instance — a persistent identity for a gateway/edge node
 * the operator manages from the dashboard.
 *
 * (Moved from stores/instanceStore.ts — TD-ARCH-006: domain types belong in types/.)
 */
export interface CoreCInstance {
  /** Auto-generated unique identifier (used in routes /corec/:id/*). */
  id: string
  /** User-defined display name (e.g. "1号车间 PLC网关"). */
  name: string
  /** Connection base URL (REST & WebSocket). */
  baseUrl: string
  /** API Bearer secret. */
  secret: string
  /** Optional color accent for the card / status dot. */
  color?: string
  /** Optional free-form notes. */
  notes?: string
  /** Optional grouping tags (e.g. ["车间A"]). */
  tags?: string[]
  /** Last successful connection timestamp (ISO 8601). */
  lastConnectedAt?: string
  /** Last known server info (cached from GET / + GET /stats). */
  lastKnownInfo?: {
    name?: string
    version?: string
    status?: string
    uptime?: string
    /** Stats from GET /stats — fetched by the homepage probe for card display. */
    stats?: {
      drivers: number
      transports: number
      rules: number
      total_read: number
      total_publish: number
      total_errors: number
      total_dropped: number
      points_per_sec: number
      tag_count?: number
      driver_stats?: Record<
        string,
        {
          name: string
          type: string
          state: number
          tag_count: number
          read_count: number
          error_count: number
        }
      >
      transport_stats?: Record<
        string,
        {
          name: string
          type: string
          state: number
          published: number
          received: number
          failed: number
        }
      >
      /** Compact connection-target summaries (e.g. "192.168.1.1:502", "mqtt://broker:1883") keyed by driver/transport name. Derived from GET /configs/raw by the homepage probe so topology rows can show the address without a ConnectionProvider. */
      driver_conn?: Record<string, string>
      transport_conn?: Record<string, string>
      rule_list?: {
        name: string
        match: string
        action: string
        target: string
        disabled: boolean
        hit_count: number
      }[]
    }
  }
  /** Creation timestamp (ISO 8601). */
  createdAt: string
  /** Sort order for card display. */
  sortOrder: number
  /** Per-instance proxy mode (ADR-004a). 'auto' follows global detection. */
  useProxy?: 'auto' | 'proxy' | 'direct'
}
