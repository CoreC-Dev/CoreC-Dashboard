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
import { apiRequest } from '../client'

// Public endpoints
export const getServerInfo = () => apiRequest<ServerInfoResponse>('/')
export const getVersion = () => apiRequest<VersionResponse>('/version')
export const getHealthLive = () => apiRequest<HealthCheckResponse>('/healthz/live')
export const getHealthReady = () => apiRequest<HealthCheckResponse>('/healthz/ready')

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
