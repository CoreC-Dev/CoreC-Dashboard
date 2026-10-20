import { ApiError, apiRequest, extractApiError } from '@/api/client'
import {
  type AlertsResponse,
  alertsResponseSchema,
  type ConfigAuditResponse,
  type ConfigBackupCreateResult,
  type ConfigBackupRestoreResult,
  type ConfigBackupsResponse,
  type ConfigSummaryResponse,
  configAuditResponseSchema,
  configBackupsResponseSchema,
  createdBackupSchema,
  type DeadLetterResponse,
  type DriversListResponse,
  type DriverTagsResponse,
  type DriverTestRequest,
  type DriverTestResult,
  driverTestResponseSchema,
  type GlobalTagsResponse,
  type HealthzReadyResult,
  healthzLiveResponseSchema,
  healthzNotReadyResponseSchema,
  healthzReadyResponseSchema,
  type PreviewDataPointInput,
  previewDataPointSchema,
  type RulesListResponse,
  type RulesPreviewResult,
  rulesPreviewResponseSchema,
  type ServerInfoResponse,
  type StatsResponse,
  type TransportsListResponse,
  type VersionResponse,
  versionResponseSchema,
  type WriteHistoryResponse,
  type WriteResponse,
  writeHistoryResponseSchema,
} from '@/types/api'
import type { DriverStatus, TransportStatus, WriteCommand } from '@/types/models'

// Public endpoints
export const getServerInfo = (options?: { signal?: AbortSignal }) =>
  apiRequest<ServerInfoResponse>('/', options)

// Configurations
export const getConfigs = () => apiRequest<ConfigSummaryResponse>('/configs')
export const updateConfigs = (data: { path?: string; payload?: string }) =>
  apiRequest<void>('/configs', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
export const patchConfigs = (data: {
  'log-level'?: string
  'log-format'?: string
  'stale-threshold'?: string
}) =>
  apiRequest<void>('/configs', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

// Path A — full config round-trip with secret redaction.
//
// getConfigsRaw returns the COMPLETE active config as YAML text with all
// values in plaintext, including secrets (api.secret, mqtt/http/driver
// passwords, webhook-secrets, auth headers). Unlike getConfigs (a names-only
// summary), this is what the Config Center YAML editor loads to show the
// server's real config.
//
// validateConfigs performs a server-side dry-run (parse + config validation,
// no apply) so the operator can see whether a config is acceptable BEFORE
// committing it. Returns { valid: true } or { valid: false, error: string }.
export const getConfigsRaw = () =>
  apiRequest<string>('/configs/raw', {
    headers: { Accept: 'application/yaml' },
  })

export interface ValidateConfigResponse {
  valid: boolean
  error?: string
  warnings?: string[]
}

export const validateConfigs = async (payload: string): Promise<ValidateConfigResponse> => {
  // apiRequest throws on 400, but validateConfigs treats a 400 with a JSON
  // {valid:false,error} body as a NORMAL outcome (the config is invalid, not a
  // transport error). Catch the ApiError, parse its body, and return it so the
  // caller gets a structured result instead of an exception.
  try {
    const res = await apiRequest<ValidateConfigResponse>('/configs/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    })
    return res
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 400 && err.body) {
      try {
        const parsed = JSON.parse(err.body) as ValidateConfigResponse
        if (typeof parsed.valid === 'boolean') {
          return parsed
        }
      } catch {
        // fall through to re-throw
      }
    }
    throw err
  }
}

// ─── Server-side config backups (hub/route/configs_backups.go) ─────────
//
// CoreC snapshots the persisted config file before every reload (newest 10
// kept). The list endpoint returns metadata only; the content endpoint
// mirrors GET /configs/raw's posture — the backup YAML carries the same
// plaintext secrets and is reachable only through this authed path.

/** GET /configs/backups — metadata of the retained backups, newest first. */
export const getConfigBackups = async (): Promise<ConfigBackupsResponse> =>
  configBackupsResponseSchema.parse(await apiRequest<unknown>('/configs/backups'))

/**
 * GET /configs/backups/{name} — the raw YAML text of one backup (plaintext
 * secrets, same posture as /configs/raw). `name` must be an exact entry of
 * the list endpoint; anything else is answered 400/404 by the server.
 */
export const getConfigBackupContent = (name: string) =>
  apiRequest<string>(`/configs/backups/${encodeURIComponent(name)}`, {
    headers: { Accept: 'application/yaml' },
  })

/**
 * POST /configs/backups/{name}/restore — runs the backup content through
 * the exact PUT /configs reload chain (parse → validate → apply → persist).
 * 204 → { outcome: 'restored' }. A 400 (backup failed validation, nothing
 * applied), 404 (unknown backup name), or 503 (no persisted config path) is
 * the ANSWER, not a transport error: normalized into { outcome: 'rejected' }
 * with the server message verbatim — same family as validateConfigs and
 * postDriverTest. Genuine failures (401/timeout/5xx) throw ApiError.
 */
/**
 * POST /configs/backups — manual snapshot of the CURRENT on-disk config
 * (distinct from the automatic pre-overwrite snapshots every reload takes).
 * 201 → { outcome: 'created', name }. A 404 (no config file on disk yet) or
 * 503 (no persisted config path) is the ANSWER, not a transport error:
 * normalized into { outcome: 'rejected' } with the server message verbatim.
 * Genuine failures (401/timeout/5xx) throw ApiError.
 */
export const createConfigBackup = async (): Promise<ConfigBackupCreateResult> => {
  try {
    const res = await apiRequest<unknown>('/configs/backups', { method: 'POST' })
    const body = createdBackupSchema.parse(res)
    return { outcome: 'created', name: body.name }
  } catch (err: unknown) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 503) && err.body) {
      return {
        outcome: 'rejected',
        status: err.status,
        error: extractApiError(err.body, err.message),
      }
    }
    throw err
  }
}

export const restoreConfigBackup = async (name: string): Promise<ConfigBackupRestoreResult> => {
  try {
    await apiRequest<void>(`/configs/backups/${encodeURIComponent(name)}/restore`, {
      method: 'POST',
    })
    return { outcome: 'restored' }
  } catch (err: unknown) {
    if (
      err instanceof ApiError &&
      (err.status === 400 || err.status === 404 || err.status === 503) &&
      err.body
    ) {
      return {
        outcome: 'rejected',
        status: err.status,
        error: extractApiError(err.body, err.message),
      }
    }
    throw err
  }
}

// Southbound Drivers
export const getDrivers = () => apiRequest<DriversListResponse>('/drivers')
export const getDriver = (name: string) =>
  apiRequest<DriverStatus>(`/drivers/${encodeURIComponent(name)}`)
export const getDriverTags = (name: string) =>
  apiRequest<DriverTagsResponse>(`/drivers/${encodeURIComponent(name)}/tags`)

// Northbound Transports
export const getTransports = () => apiRequest<TransportsListResponse>('/transports')
export const getTransport = (name: string) =>
  apiRequest<TransportStatus>(`/transports/${encodeURIComponent(name)}`)
// Driver collection pause/resume (audit RES-4): scheduler-level switch,
// config and connection untouched; tasks resume at the next tick.
export const pauseDriver = (name: string) =>
  apiRequest<void>(`/drivers/${encodeURIComponent(name)}/pause`, { method: 'POST' })

export const resumeDriver = (name: string) =>
  apiRequest<void>(`/drivers/${encodeURIComponent(name)}/resume`, { method: 'POST' })

export const getPausedDrivers = () => apiRequest<{ paused: string[] }>('/drivers/paused')

export const testTransport = (name: string) =>
  apiRequest<{ ok: boolean; message?: string }>(`/transports/${encodeURIComponent(name)}/test`, {
    method: 'POST',
  })

// Realtime Tags & Control
export const getTags = () => apiRequest<GlobalTagsResponse>('/tags')
/** Server-side filtered /tags (roadmap #35): driver snapshot / name prefix / substring. */
export const getTagsFiltered = (params: { driver?: string; prefix?: string; tag?: string }) => {
  const q = new URLSearchParams()
  if (params.driver) q.set('driver', params.driver)
  if (params.prefix) q.set('prefix', params.prefix)
  if (params.tag) q.set('tag', params.tag)
  const qs = q.toString()
  return apiRequest<GlobalTagsResponse>(`/tags${qs ? `?${qs}` : ''}`)
}
export const writeTag = (cmd: WriteCommand) =>
  apiRequest<WriteResponse>('/write', {
    method: 'POST',
    body: JSON.stringify(cmd),
  })
export const getDeadLetters = () => apiRequest<DeadLetterResponse>('/write/failed')

// First-class alerts (audit OBS-4/HUB-6): the engine's alert registry.
// Zod-validated at the boundary (AGENTS.md: 后端响应不可信任).
/** Config change audit trail (audit HUB-4): newest-first successful mutations. */
export const getConfigAudit = async (): Promise<ConfigAuditResponse> =>
  configAuditResponseSchema.parse(await apiRequest<unknown>('/configs/audit'))

export const getAlerts = async (): Promise<AlertsResponse> =>
  alertsResponseSchema.parse(await apiRequest<unknown>('/alerts'))

/** Acknowledge an active alert by its "rule|driver|tag" key (204 on success). */
export const ackAlert = (key: string) =>
  apiRequest<void>('/alerts/ack', {
    method: 'POST',
    body: JSON.stringify({ key }),
  })

// Rules Engine
export const getRules = () => apiRequest<RulesListResponse>('/rules')
// Resource-level DELETE (audit HUB-3): single-resource removal; the
// backend splices internally and runs the full PUT /configs safety chain.
export const deleteDriver = (name: string) =>
  apiRequest<void>(`/drivers/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const deleteTransport = (name: string) =>
  apiRequest<void>(`/transports/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const deleteRule = (name: string) =>
  apiRequest<void>(`/rules/${encodeURIComponent(name)}`, { method: 'DELETE' })
// Rule name is the stable identifier across config reloads (an index can
// shift when rules are reordered); the backend resolves it server-side.
export const toggleRule = (name: string, disabled: boolean) =>
  apiRequest<void>('/rules/disable', {
    method: 'PATCH',
    body: JSON.stringify({ name, disabled }),
  })

// Statistics & Metrics
export const getStats = () => apiRequest<StatsResponse>('/stats')
export const getMetricsText = () => apiRequest<string>('/metrics')

// Write Operation History & Instance Health
//
// These responses are validated with zod at this boundary (AGENTS.md:
// 后端响应不可信任) — the endpoints take `unknown` from apiRequest and
// parse, so a contract drift surfaces here instead of rendering garbage
// in the UI. Legacy endpoints above keep their TS type assertions.
//
// /version and /healthz/* are PUBLIC CoreC routes (registered outside the
// auth group); apiRequest still attaches the Bearer token, which the
// server ignores — the same /corec-proxy routing and header handling as
// every other endpoint (see getStats / getServerInfo).
export const getWriteHistory = async (): Promise<WriteHistoryResponse> =>
  writeHistoryResponseSchema.parse(await apiRequest<unknown>('/write/history'))

/** Server-side filtered write history (roadmap #35): compliance retrieval in one call. */
export const getWriteHistoryFiltered = async (params: {
  driver?: string
  tag?: string
  since?: string
  limit?: number
}): Promise<WriteHistoryResponse> => {
  const q = new URLSearchParams()
  if (params.driver) q.set('driver', params.driver)
  if (params.tag) q.set('tag', params.tag)
  if (params.since) q.set('since', params.since)
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  const qs = q.toString()
  return writeHistoryResponseSchema.parse(
    await apiRequest<unknown>(`/write/history${qs ? `?${qs}` : ''}`),
  )
}

export const getVersion = async (): Promise<VersionResponse> =>
  versionResponseSchema.parse(await apiRequest<unknown>('/version'))

export const getHealthzLive = async () =>
  healthzLiveResponseSchema.parse(await apiRequest<unknown>('/healthz/live'))

/**
 * Readiness probe, normalized: a 503 is the "not ready" OUTCOME, not a
 * transport error — the body carries the reason and per-component
 * connectivity, so parse it into { ready: false, ... } for a yellow
 * badge. Genuine failures (5xx other than 503, malformed 503 body,
 * timeouts) re-throw ApiError.
 */
export const getHealthzReady = async (): Promise<HealthzReadyResult> => {
  try {
    await healthzReadyResponseSchema.parse(await apiRequest<unknown>('/healthz/ready'))
    return { ready: true }
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 503 && err.body) {
      try {
        const parsed = healthzNotReadyResponseSchema.parse(JSON.parse(err.body))
        return {
          ready: false,
          reason: parsed.reason,
          components: parsed.components,
        }
      } catch {
        // fall through to re-throw — an unparseable 503 body is a
        // contract violation, not a readiness state.
      }
    }
    throw err
  }
}

/**
 * Driver connectivity test (POST /drivers/test) — the backend spins up a
 * throwaway instance of `type` with `settings`, runs the same init→start
 * lifecycle a configured driver follows, and always tears it down. The
 * instance is never registered and nothing is persisted, so the operator
 * can validate a driver config BEFORE saving it.
 *
 * The 200 body is zod-parsed at this boundary. A 400 (unknown driver
 * type, settings the driver factory rejects) is normalized into
 * { outcome: 'rejected' } with the server message verbatim — it is the
 * answer, not a transport error. The 5s server-side timeout surfaces as a
 * 200 { ok: false, error: "driver test timed out after 5s" }.
 */
export const postDriverTest = async (
  type: string,
  settings: Record<string, unknown>,
  name?: string,
): Promise<DriverTestResult> => {
  const req: DriverTestRequest = { type, settings, name }
  try {
    const data = driverTestResponseSchema.parse(
      await apiRequest<unknown>('/drivers/test', {
        method: 'POST',
        body: JSON.stringify(req),
      }),
    )
    return { outcome: 'completed', data }
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 400 && err.body) {
      return { outcome: 'rejected', error: extractApiError(err.body, err.message) }
    }
    throw err
  }
}

/**
 * Rule preview (POST /rules/preview) — trial-runs a match expression
 * against a sample data point in a scratch rule engine. The active rule
 * set is never touched, so rule authors can validate syntax and
 * semantics BEFORE saving instead of discovering a compile error only
 * when production data flows through a saved rule.
 *
 * The 200 body is zod-parsed at this boundary. A 400 (compile/eval
 * error) is returned verbatim by the backend precisely so the UI can
 * show it next to the expression editor — normalized here into
 * { outcome: 'error' } rather than thrown; 501 (engine without preview
 * support) lands there too. Genuine transport failures still throw
 * ApiError.
 */
export const postRulesPreview = async (
  match: string,
  point?: PreviewDataPointInput,
): Promise<RulesPreviewResult> => {
  // Validate the outgoing sample point at the boundary: a malformed form
  // payload (unknown DataType, out-of-range quality) must surface here,
  // not on the backend.
  const validatedPoint = point === undefined ? undefined : previewDataPointSchema.parse(point)
  try {
    const res = rulesPreviewResponseSchema.parse(
      await apiRequest<unknown>('/rules/preview', {
        method: 'POST',
        body: JSON.stringify(
          validatedPoint === undefined ? { match } : { match, point: validatedPoint },
        ),
      }),
    )
    return { outcome: 'evaluated', matched: res.matched }
  } catch (err: unknown) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 501) && err.body) {
      return { outcome: 'error', status: err.status, error: extractApiError(err.body, err.message) }
    }
    throw err
  }
}
