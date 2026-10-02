import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection } from '@/contexts/ConnectionContext'
import type { WriteCommand } from '@/types/models'
import * as api from '../endpoints'

function useConnectedQuery<T>({
  queryKey,
  queryFn,
  refetchInterval,
  enabled,
}: {
  queryKey: unknown[]
  queryFn: () => Promise<T>
  refetchInterval?: number | false
  enabled?: boolean
}) {
  const { isConnected } = useConnection()
  return useQuery({
    queryKey,
    queryFn,
    enabled: isConnected && (enabled ?? true),
    ...(refetchInterval !== undefined ? { refetchInterval } : {}),
  })
}

export function useServerInfo() {
  return useConnectedQuery({
    queryKey: ['serverInfo'],
    queryFn: api.getServerInfo,
    refetchInterval: 30000,
  })
}

export function useDrivers() {
  return useConnectedQuery({
    queryKey: ['drivers'],
    queryFn: api.getDrivers,
    refetchInterval: 15000,
  })
}

export function useDriver(name: string) {
  return useConnectedQuery({
    queryKey: ['driver', name],
    queryFn: () => api.getDriver(name),
    enabled: !!name,
    refetchInterval: 5000,
  })
}

export function useDriverTags(name: string) {
  return useConnectedQuery({
    queryKey: ['driverTags', name],
    queryFn: () => api.getDriverTags(name),
    enabled: !!name,
    refetchInterval: 5000,
  })
}

export function useTransports() {
  return useConnectedQuery({
    queryKey: ['transports'],
    queryFn: api.getTransports,
    refetchInterval: 15000,
  })
}

export function useTransport(name: string) {
  return useConnectedQuery({
    queryKey: ['transport', name],
    queryFn: () => api.getTransport(name),
    enabled: !!name,
    refetchInterval: 5000,
  })
}

export function useTags() {
  return useConnectedQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
    refetchInterval: 5000,
  })
}

export function useRules() {
  return useConnectedQuery({
    queryKey: ['rules'],
    queryFn: api.getRules,
    refetchInterval: 15000,
  })
}

export function useStats() {
  return useConnectedQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    refetchInterval: 5000,
  })
}

export function useConfigs() {
  return useConnectedQuery({
    queryKey: ['configs'],
    queryFn: api.getConfigs,
  })
}

/**
 * Path A — fetches the full active config as redacted YAML text from
 * GET /configs/raw. Secrets are masked as "***" on the server; this string is
 * fed directly into the Config Center YAML editor (js-yaml load/dump) and, on
 * submit, round-tripped back via PUT /configs where the executor's
 * sentinel-merge restores the real secret values.
 *
 * Not polled (no refetchInterval): the raw config only changes via PUT
 * /configs, and useUpdateConfig invalidates ['configsRaw'] on success.
 */
export function useConfigRaw() {
  return useConnectedQuery({
    queryKey: ['configsRaw'],
    queryFn: api.getConfigsRaw,
  })
}

export function useDeadLetters() {
  return useConnectedQuery({
    queryKey: ['deadLetters'],
    queryFn: api.getDeadLetters,
    refetchInterval: 4000,
  })
}

// Mutations
export function useWriteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cmd: WriteCommand) => api.writeTag(cmd),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['deadLetters'] })
      // Invalidate the specific driver's tags and status so the UI reflects
      // the write immediately rather than waiting for the next poll.
      queryClient.invalidateQueries({ queryKey: ['driverTags', variables.driver] })
      queryClient.invalidateQueries({ queryKey: ['driver', variables.driver] })
    },
  })
}

export function useToggleRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ index, disabled }: { index: number; disabled: boolean }) =>
      api.toggleRule(index, disabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
    },
  })
}

export function usePatchConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { 'log-level'?: string }) => api.patchConfigs(data),
    onSuccess: () => {
      // PATCH mutates the active config (log-level is a global field), so the
      // raw-redacted view goes stale too — invalidate both caches for parity
      // with useUpdateConfig. [M-1]
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      queryClient.invalidateQueries({ queryKey: ['configsRaw'] })
    },
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { path?: string; payload: string }) => api.updateConfigs(data),
    onSuccess: () => {
      // After a successful reload, the active config changed — invalidate both
      // the summary and the raw-redacted view so the editor reflects the new
      // state on next read.
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      queryClient.invalidateQueries({ queryKey: ['configsRaw'] })
    },
  })
}

/**
 * Path A — server-side dry-run validation of a config payload via
 * POST /configs/validate. Runs parse + config validation WITHOUT applying,
 * so the operator can catch errors before committing a PUT /configs.
 *
 * Returns { valid: true } on success or { valid: false, error: string } on
 * validation failure (the endpoint wrapper normalizes a 400 into this shape,
 * so the mutation resolves rather than throwing for ordinary validation
 * errors; genuine transport/500 errors still throw).
 */
export function useValidateConfig() {
  return useMutation({
    mutationFn: (payload: string) => api.validateConfigs(payload),
  })
}

/**
 * Prometheus /metrics text. Used by the Diagnostics page with a configurable
 * refetchInterval (default 12s) so polling is managed by TanStack Query
 * instead of a manual setInterval.
 */
export function useMetrics(refetchInterval: number | false = 12_000) {
  return useConnectedQuery({
    queryKey: ['metrics'],
    queryFn: api.getMetricsText,
    refetchInterval,
  })
}

// Re-export ApiError so features don't reach into the raw HTTP client (TD-ARCH-008).
// api/client is an internal transport detail; consumers should catch ApiError via this surface.
export { ApiError } from '../client'
