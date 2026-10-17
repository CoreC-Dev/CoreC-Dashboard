import { ApiError, apiRequest, extractApiError } from '@/api/client'
import {
  type ConfigSummaryResponse,
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
  type RulesListResponse,
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
export const patchConfigs = (data: { 'log-level'?: string }) =>
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
export const testTransport = (name: string) =>
  apiRequest<{ ok: boolean; message?: string }>(`/transports/${encodeURIComponent(name)}/test`, {
    method: 'POST',
  })

// Realtime Tags & Control
export const getTags = () => apiRequest<GlobalTagsResponse>('/tags')
export const writeTag = (cmd: WriteCommand) =>
  apiRequest<WriteResponse>('/write', {
    method: 'POST',
    body: JSON.stringify(cmd),
  })
export const getDeadLetters = () => apiRequest<DeadLetterResponse>('/write/failed')

// Rules Engine
export const getRules = () => apiRequest<RulesListResponse>('/rules')
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
