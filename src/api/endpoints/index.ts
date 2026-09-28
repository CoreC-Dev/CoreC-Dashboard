import type {
  ConfigSummaryResponse,
  DeadLetterResponse,
  DriversListResponse,
  DriverTagsResponse,
  GlobalTagsResponse,
  HealthCheckResponse,
  RulesListResponse,
  ServerInfoResponse,
  StatsResponse,
  TransportsListResponse,
  VersionResponse,
  WriteResponse,
} from '@/types/api'
import type { DriverStatus, TransportStatus, WriteCommand } from '@/types/models'
import { ApiError, apiRequest } from '../client'

// Public endpoints
export const getServerInfo = () => apiRequest<ServerInfoResponse>('/')
export const getVersion = () => apiRequest<VersionResponse>('/version')
export const getHealthLive = () => apiRequest<HealthCheckResponse>('/healthz/live')

// /healthz/ready legitimately returns 503 with a usable JSON body
// ({"status":"not_ready","reason":...,"components":...}) when the engine
// isn't fully ready (e.g. a driver is still connecting). apiRequest throws
// on non-2xx, so we tolerate 503 here and parse the body.
export const getHealthReady = async (): Promise<HealthCheckResponse> => {
  try {
    return await apiRequest<HealthCheckResponse>('/healthz/ready')
  } catch (err: unknown) {
    // 503 is a valid "not ready" response — re-parse the body if available.
    if (err instanceof ApiError && err.status === 503 && err.body) {
      try {
        return JSON.parse(err.body)
      } catch {
        // fall through to re-throw
      }
    }
    throw err
  }
}

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
// getConfigsRaw returns the COMPLETE active config as YAML text with every
// secret value redacted to "***" (api.secret, mqtt/http/driver passwords,
// webhook-secrets, auth headers). Unlike getConfigs (a names-only summary),
// this is what the Config Center YAML editor loads to show the server's real
// config without exposing credentials. The executor's sentinel-merge restores
// the real secret values when the edited config is submitted back via PUT.
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
export const toggleRule = (index: number, disabled: boolean) =>
  apiRequest<void>('/rules/disable', {
    method: 'PATCH',
    body: JSON.stringify({ index, disabled }),
  })

// Statistics & Metrics
export const getStats = () => apiRequest<StatsResponse>('/stats')
export const getMetricsText = () => apiRequest<string>('/metrics')
