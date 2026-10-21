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
  /**
   * true when the write bypassed the tag's scale/offset inversion
   * (audit DRV-1): the recorded value IS the device-side raw
   * representation. Omitted (false) for engineering-value writes.
   */
  raw: z.boolean().optional(),
})

export const writeHistoryResponseSchema = z.object({
  /** Newest-first, server-capped at 1000 entries. */
  writes: z.array(writeAuditEntrySchema),
  /** Entry count, mirroring DeadLetterResponse's shape (hub/route/write_history.go). */
  count: z.number(),
})

export type WriteHistoryResponse = z.infer<typeof writeHistoryResponseSchema>

// ─── Config change audit (GET /configs/audit) ────────────────────────
//
// Bounded, newest-first trail of successful configuration mutations
// (backend audit HUB-4). In-memory only: the on-disk truth is the
// config file + backups.

export const configAuditEntrySchema = z.object({
  at: z.string(),
  action: z.enum(['reload', 'patch', 'restore']),
  remote: z.string().optional(),
  keys: z.array(z.string()).optional(),
  details: z.string().optional(),
})

export const configAuditResponseSchema = z.object({
  changes: z.array(configAuditEntrySchema),
  count: z.number(),
})

export type ConfigAuditResponse = z.infer<typeof configAuditResponseSchema>

// ─── First-class alerts (GET /alerts, POST /alerts/ack) ──────────────
//
// The engine's alert registry (audit OBS-4/HUB-6): active alerts have
// identity (rule|driver|tag), a fire count, and an ack flag; the
// bounded history carries fired/acked/cleared events newest-first.
// Validated with zod at the endpoint boundary (后端响应不可信任).

export const alertSchema = z.object({
  key: z.string(),
  rule: z.string(),
  driver: z.string(),
  tag: z.string(),
  value: z.unknown().optional(),
  quality: z.number(),
  first_fired: z.string(),
  last_fired: z.string(),
  count: z.number(),
  acked: z.boolean(),
  acked_at: z.string().optional(),
})

export const alertEventSchema = z.object({
  type: z.enum(['fired', 'acked', 'cleared']),
  alert: alertSchema,
  at: z.string(),
})

export const alertsResponseSchema = z.object({
  alerts: z.array(alertSchema),
  history: z.array(alertEventSchema),
  active_count: z.number(),
  acked_count: z.number(),
})

export type AlertsResponse = z.infer<typeof alertsResponseSchema>

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

// ─── Driver connectivity test (POST /drivers/test) ────────────────────
//
// The backend instantiates a THROWAWAY driver from the request, drives it
// through the same init→start lifecycle a configured driver follows,
// measures the connect attempt, and always tears the instance down. Both
// outcomes are 200 (hub/route/driver_check.go): a completed run with
// connected=false is a successful TEST, not a server error.

/**
 * Request body of POST /drivers/test. The json field names are defined
 * explicitly in the handler (core.DriverConfig only carries yaml tags), so
 * they are pinned HERE too — `settings` mirrors drivers[].settings in the
 * YAML config exactly.
 */
export interface DriverTestRequest {
  /** Registered driver type to instantiate, e.g. "modbus-tcp". Empty → 400. */
  type: string
  /** Protocol-specific connection parameters, exactly as they will be saved. */
  settings: Record<string, unknown>
  /**
   * Log label for the temporary instance (informational only — nothing is
   * registered or persisted). Defaults to "driver-test" server-side.
   */
  name?: string
}

/** 200 body of POST /drivers/test, validated with zod at the boundary. */
export const driverTestResponseSchema = z.object({
  /** Lifecycle ended connected (equivalent to `connected`). */
  ok: z.boolean(),
  /** Init + Start (the connection attempt) succeeded. */
  connected: z.boolean(),
  /** Connect attempt duration (init+start, no teardown), milliseconds. */
  latency_ms: z.number(),
  /** Echo of the request `type`. */
  driver_type: z.string(),
  /** Failure message, only present when connected=false. */
  error: z.string().optional(),
})
export type DriverTestResponse = z.infer<typeof driverTestResponseSchema>

/**
 * Normalized probe outcome. `completed` is a finished test run (connected
 * OR not — both are 200). `rejected` mirrors the backend's own log wording
 * for a request the server refused (unknown driver type, settings the
 * factory rejects): the message is the answer the operator needs, shown
 * verbatim, so it is a result rather than a thrown transport error — the
 * same normalization validateConfigs applies to its 400s. Genuine
 * transport failures (401/timeout/5xx/malformed body) still throw ApiError.
 */
export type DriverTestResult =
  | { outcome: 'completed'; data: DriverTestResponse }
  | { outcome: 'rejected'; error: string }

// ─── Rule preview (POST /rules/preview) ───────────────────────────────
//
// Offline trial-run of a match expression against a sample data point in
// a scratch rule engine — the active rule set is never touched, so rule
// authors can validate syntax and semantics BEFORE saving (hub/route/
// rules_preview.go).

/**
 * The sample data point of POST /rules/preview, zod-shaped after the
 * DataPoint the /tags API returns (models.DataPoint ↔ core.DataPoint):
 * string DataType vocabulary, numeric quality. The endpoint parses the
 * outgoing point through this schema so a malformed form payload surfaces
 * at the boundary instead of reaching the backend.
 */
export const previewDataPointSchema = z.object({
  driver: z.string(),
  /** Tolerant default: contract-required, but device-less drivers omit it. */
  device: z.string().default(''),
  group: z.string().default(''),
  tag: z.string(),
  /** JSON payloads carry number/bool/string (and null); never `any`. */
  value: writeAuditValueSchema,
  /** Same DataType vocabulary as tag configs (core/types.go). */
  type: z.enum(DATA_TYPES),
  /** 0=Good, 1=Bad, 2=Uncertain (core Quality). */
  quality: z.number().int().min(0).max(2),
  /** RFC3339, e.g. "2024-09-08T10:30:00Z". */
  timestamp: z.string(),
  metadata: z.record(z.string(), z.string()).optional(),
  is_stale: z.boolean().optional(),
})
export type PreviewDataPoint = z.infer<typeof previewDataPointSchema>
/**
 * Input-side shape of the sample point: device/group/metadata optional
 * (zod fills the tolerant defaults), so callers can pass DataPoint-shaped
 * objects the way the /tags API returns them.
 */
export type PreviewDataPointInput = z.input<typeof previewDataPointSchema>

/** 200 body of POST /rules/preview, validated with zod at the boundary. */
export const rulesPreviewResponseSchema = z.object({
  /** Whether a rule with this match expression would hit on the sample point. */
  matched: z.boolean(),
})

/**
 * Normalized preview outcome. `error` covers the two response codes whose
 * body IS the answer the rule author asked for: 400 compile/eval errors
 * (returned verbatim by the backend precisely so the UI can show them
 * next to the editor) and 501 "engine without preview support". Genuine
 * transport failures (401/timeout/5xx/malformed body) still throw
 * ApiError.
 */
export type RulesPreviewResult =
  | { outcome: 'evaluated'; matched: boolean }
  | { outcome: 'error'; status: number; error: string }

/** Variables of the useRulesPreview mutation (the endpoint takes them positionally). */
export interface RulesPreviewRequest {
  /** Match expression under test; empty is rejected with 400 by the backend. */
  match: string
  /** Sample data point; omitted → the backend evaluates against a zero-value point. */
  point?: PreviewDataPointInput
}

// ─── Server-side config backups (/configs/backups*) ─────────────────────
//
// CoreC snapshots the persisted config file before every reload and keeps
// the newest 10 backups next to it (hub/executor/backups.go). The list
// carries METADATA only — backup content holds the same plaintext secrets
// as GET /configs/raw and is served solely through GET /configs/backups/{name}
// (hub/route/configs_backups.go). All three endpoints zod-parse at the
// boundary (AGENTS.md: 后端响应不可信任).

/** One backup entry of GET /configs/backups — metadata only, never content. */
export const configBackupInfoSchema = z.object({
  /**
   * Strict "<unix-nano>.yaml" generated file name — the identifier used
   * by the content and restore endpoints. The server rejects anything
   * else (traversal fragments, arbitrary paths) with 400/404.
   */
  name: z.string(),
  /** RFC3339 UTC timestamp derived from the file name's unix-nano stamp. */
  timestamp: z.string(),
  /** Backup file size in bytes. */
  size: z.number(),
})
export type ConfigBackupInfo = z.infer<typeof configBackupInfoSchema>

/** GET /configs/backups → {backups:[…]}, newest first, server-capped at 10. */
export const configBackupsResponseSchema = z.object({
  backups: z.array(configBackupInfoSchema),
})
export type ConfigBackupsResponse = z.infer<typeof configBackupsResponseSchema>

/**
 * Normalized restore outcome (POST /configs/backups/{name}/restore).
 * `restored` is the 204 success — the backup content went through the
 * exact PUT /configs reload chain (parse → validate → ApplyConfig →
 * persist), and the replaced on-disk state was snapshotted first, so the
 * restore can itself be rolled back. `rejected` covers the statuses whose
 * body IS the answer: 400 (backup no longer passes validation — nothing
 * was applied), 404 (unknown/pruned backup name), 503 (no persisted
 * config path). Same normalization family as validateConfigs and
 * postDriverTest; genuine transport failures (401/timeout/5xx) throw
 * ApiError from the endpoint wrapper.
 */
export type ConfigBackupRestoreResult =
  | { outcome: 'restored' }
  | { outcome: 'rejected'; status: number; error: string }

/**
 * Normalized manual-snapshot outcome (POST /configs/backups). `created` is
 * the 201 success carrying the new backup's name. `rejected` covers the
 * statuses whose body IS the answer: 404 (no config file on disk yet),
 * 503 (no persisted config path). Same normalization family as
 * restoreConfigBackup; genuine transport failures throw ApiError.
 */
export type ConfigBackupCreateResult =
  | { outcome: 'created'; name: string }
  | { outcome: 'rejected'; status: number; error: string }

/** POST /configs/backups 201 body — the freshly created backup's name. */
export const createdBackupSchema = z.object({
  name: z.string(),
})

// ─── Realtime WS push frames (/traffic, /memory) ─────────────────────────
//
// CoreC pushes these JSON frames on a ticker (default 1s, tunable via
// ?interval= — hub/route/traffic.go / memory.go). The CoreCWebSocket layer
// only JSON.parses, so consumers validate each frame against these schemas
// at the boundary (AGENTS.md: 后端响应不可信任) and drop malformed pushes
// instead of rendering garbage. The shapes mirror the existing
// models.TrafficFrame / models.MemoryFrame.

/**
 * /memory frame — zero-STW runtime/metrics analogs of runtime.ReadMemStats:
 * heap objects bytes (≈HeapAlloc), total allocs, total memory class (≈Sys),
 * completed GC cycles, plus the live goroutine count.
 */
export const memoryFrameSchema = z.object({
  alloc: z.number(),
  total_alloc: z.number(),
  sys: z.number(),
  num_gc: z.number(),
  goroutines: z.number(),
})
export type MemoryFrameMessage = z.infer<typeof memoryFrameSchema>

// ─── /logs frame ────────────────────────────────────────────────────────
// Backend audit F1 (2026-10-21): the backend marshals slog.Level as a
// STRING ("WARN", "DEBUG", "ERROR+2" for custom severities — verified by
// compiling json.Marshal against the Go source), while LogEvent.level is
// the numeric contract (-8/0/4/8). Numeric input passes through so
// legacy mocks keep their meaning; unparseable levels fail the parse so
// the frame is dropped at the boundary instead of misclassified.
const LOG_LEVEL_BASES = {
  DEBUG: -8,
  INFO: 0,
  WARN: 4,
  ERROR: 8,
} as const

/** Normalize a backend level value (string | legacy number) → number; NaN if unparseable. */
export function parseLogLevel(level: unknown): number {
  if (typeof level === 'number') return level
  if (typeof level !== 'string') return Number.NaN
  const match = /^(DEBUG|INFO|WARN|ERROR)([+-]\d+)?$/.exec(level.toUpperCase())
  if (!match) return Number.NaN
  const base = LOG_LEVEL_BASES[match[1] as keyof typeof LOG_LEVEL_BASES]
  return match[2] === undefined ? base : base + Number.parseInt(match[2], 10)
}

export const logEventSchema = z.object({
  level: z.preprocess(parseLogLevel, z.number()),
  type: z.string(),
  payload: z.string(),
  timestamp: z.string(),
})
export type LogEventFrame = z.infer<typeof logEventSchema>

// ─── /traffic frames (backend roadmap #32) ─────────────────────────────
// Default mode pushes server-side diffed RATES; ?mode=totals keeps the
// legacy cumulative counters. The previous cumulative-only schema
// silently dropped every default-mode frame (audit F2) — the two modes
// are now a discriminated union so either contract validates and the
// panel picks fields by shape.
export const trafficRateFrameSchema = z.object({
  read_rate: z.number(),
  publish_rate: z.number(),
  dropped_rate: z.number(),
})
export const trafficTotalsFrameSchema = z.object({
  read: z.number(),
  publish: z.number(),
  dropped: z.number(),
})
export const trafficFrameSchema = z.union([trafficRateFrameSchema, trafficTotalsFrameSchema])
export type TrafficRateFrame = z.infer<typeof trafficRateFrameSchema>
export type TrafficTotalsFrame = z.infer<typeof trafficTotalsFrameSchema>
