import { z } from 'zod'
import { DATA_TYPES } from '@/types/config'
import type {
  DataPoint,
  DeadLetterEntry,
  DriverStatus,
  EngineStats,
  RuleStat,
  TransportStatus,
} from '@/types/models'

export interface ServerInfoResponse {
  name: string
  version: string
  status: string
  time: string
  uptime: string
}

export interface ConfigSummaryResponse {
  global?: {
    'log-level'?: string
    api?: {
      listen?: string
      'secret-set'?: boolean
    }
  }
  drivers?: { name: string; type: string }[]
  transports?: { name: string; type: string }[]
  rules?: { name: string; type: string; action: string; priority: number }[]
}

export interface DriversListResponse {
  drivers: DriverStatus[]
}

export interface DriverTagsResponse {
  // CoreC returns {"tags": null} (not 404) for unknown drivers or drivers
  // with no cached tag values. Callers must guard for null.
  tags: Record<string, DataPoint> | null
}

export interface TransportsListResponse {
  transports: TransportStatus[]
}

export interface GlobalTagsResponse {
  tags: Record<string, DataPoint>
}

export interface WriteResponse {
  success: boolean
  error?: string
}

export interface DeadLetterResponse {
  failed_writes: DeadLetterEntry[]
  count: number
}

export interface RulesListResponse {
  rules: RuleStat[]
}

export type StatsResponse = EngineStats

// ─── Write operation history (GET /write/history) ─────────────────────
//
// CoreC keeps a bounded in-memory audit log of every tag write — both
// forward REST API writes and reverse stream ("command") writes — served
// newest-first, capped at 1000 entries. The response is validated with
// zod at the endpoint boundary (AGENTS.md: 后端响应不可信任).

/** Origin of an audited write: forward REST API write or reverse stream command write. */
export const writeAuditSourceSchema = z.enum(['api', 'command'])

/**
 * The written value. JSON payloads carry number/bool/string (and null can
 * appear on failed attempts), so the union is explicit — never `any`
 * (any-ratchet BASELINE = 0).
 */
export const writeAuditValueSchema = z.union([z.number(), z.boolean(), z.string(), z.null()])

export const writeAuditEntrySchema = z.object({
  /** RFC3339 with nanoseconds, e.g. "2024-01-01T12:00:00.123456789Z". */
  timestamp: z.string(),
  driver: z.string(),
  /** Contract-required, but tolerate omission (device-less drivers) → ''. */
  device: z.string().default(''),
  tag: z.string(),
  value: writeAuditValueSchema,
  /** Same DataType vocabulary as tag configs (core/types.go). */
  type: z.enum(DATA_TYPES),
  success: z.boolean(),
  /** Present on failed writes. */
  error: z.string().optional(),
  source: writeAuditSourceSchema,
  /** Originating client address — only set for source="api" writes. */
  remote: z.string().optional(),
})

export const writeHistoryResponseSchema = z.object({
  /** Newest-first, server-capped at 1000 entries. */
  writes: z.array(writeAuditEntrySchema),
  /** Entry count, mirroring DeadLetterResponse's shape (hub/route/write_history.go). */
  count: z.number(),
})

export type WriteAuditSource = z.infer<typeof writeAuditSourceSchema>
export type WriteAuditEntry = z.infer<typeof writeAuditEntrySchema>
export type WriteHistoryResponse = z.infer<typeof writeHistoryResponseSchema>

// ─── Public instance endpoints (/version, /healthz/*) ────────────────
//
// These are registered OUTSIDE CoreC's auth group (hub/route/router.go)
// so Kubernetes probes can reach them without a secret. The dashboard
// still calls them through the authed client — the attached Bearer token
// is simply ignored by the server.

/** GET /version → {"version":"<CoreC semver>"} (hub/route/server.go getVersion). */
export const versionResponseSchema = z.object({
  version: z.string(),
})
export type VersionResponse = z.infer<typeof versionResponseSchema>

/** GET /healthz/live → 200 {"status":"alive"} whenever the process serves HTTP. */
export const healthzLiveResponseSchema = z.object({
  status: z.literal('alive'),
})
export type HealthzLiveResponse = z.infer<typeof healthzLiveResponseSchema>

/** GET /healthz/ready (ready) → 200 {"status":"ready"} — minimal for high-frequency probes. */
export const healthzReadyResponseSchema = z.object({
  status: z.literal('ready'),
})

/** One driver/transport connectivity flag inside a not-ready body. */
export const healthComponentSchema = z.object({
  name: z.string(),
  connected: z.boolean(),
})
export type HealthComponent = z.infer<typeof healthComponentSchema>

/**
 * GET /healthz/ready (not ready) → 503 body with a reason and per-component
 * connectivity. Both component arrays are always present (possibly empty)
 * so the shape is stable for probe consumers (hub/route/health.go).
 */
export const healthzNotReadyResponseSchema = z.object({
  status: z.literal('not_ready'),
  reason: z.string(),
  components: z.object({
    drivers: z.array(healthComponentSchema),
    transports: z.array(healthComponentSchema),
  }),
})
export type HealthzNotReadyResponse = z.infer<typeof healthzNotReadyResponseSchema>

/**
 * Normalized readiness result: `{ ready: true }` for the 200 body, or the
 * parsed 503 body when the engine is not ready. Transport-level failures
 * (timeout, 5xx, malformed body) still throw ApiError from the endpoint
 * wrapper — the UI then renders a red badge instead of a yellow one.
 */
export type HealthzReadyResult =
  | { ready: true }
  | {
      ready: false
      reason: string
      components: {
        drivers: HealthComponent[]
        transports: HealthComponent[]
      }
    }
