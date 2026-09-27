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
