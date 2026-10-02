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
  value: unknown
  type: DataTypeString | number
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
  disabled: boolean
  hit_count: number
  hit_at: string
  miss_count: number
  miss_at: string
}

export interface DeadLetterEntry {
  command: WriteCommand
  error: string
  failed_at: string
  attempts: number
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
  level: number // -4=debug, 0=info, 4=warn, 8=error
  type: string
  payload: string
  timestamp: string
}

export interface TrafficFrame {
  read: number
  publish: number
  dropped: number
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
}
