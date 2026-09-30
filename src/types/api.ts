import type {
  DataPoint,
  DeadLetterEntry,
  DriverStatus,
  EngineStats,
  RuleStat,
  TransportStatus,
} from './models'

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
