import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import * as api from '@/api/endpoints'
import { CoreCWebSocket, type WSStatus } from '@/api/websocket'
import { useConnectionStore } from '@/stores/connectionStore'
import { makeStreamId, useWsStatusStore } from '@/stores/wsStatusStore'
import type { DriverTestRequest, RulesPreviewRequest } from '@/types/api'
import type { WriteCommand } from '@/types/models'

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
  const isConnected = useConnectionStore((s) => s.isConnected)
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

export { usePauseDriver, usePausedDrivers, useResumeDriver } from '@/api/hooks/driverPause'

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
  // No refetchInterval: TagExplorerPage seeds from this REST snapshot once,
  // then the /tags/stream WebSocket owns live state (hasSeeded guard ignores
  // subsequent polls). A 5s REST poll was pure waste — ~12 req/min eliminated.
  // Manual Refresh calls refetch() explicitly. [perf: redundant poll removed]
  return useConnectedQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
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
 * Path A — fetches the full active config as raw YAML text from
 * GET /configs/raw. Verified against the backend (hub/executor
 * RawConfigYAML): the server returns the config PLAINTEXT, secrets
 * included — there is no masking and no sentinel-merge on submit. The
 * editor and every PUT therefore round-trip real secret values; the
 * endpoint is authenticated for exactly this reason.
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
  // Poll every 15s (was 4s). Dead letters are a low-urgency diagnostic queue —
  // 4s was excessively aggressive (~15 req/min) for data that changes slowly.
  // [behavior change: refetchInterval 4000→15000, registered in plan doc §六-B4]
  return useConnectedQuery({
    queryKey: ['deadLetters'],
    queryFn: api.getDeadLetters,
    refetchInterval: 15000,
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
      // The write audit trail must reflect the write immediately rather
      // than waiting for the next 15s poll.
      queryClient.invalidateQueries({ queryKey: ['writeHistory'] })
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
    mutationFn: ({ name, disabled }: { name: string; disabled: boolean }) =>
      api.toggleRule(name, disabled),
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
      // raw config view goes stale too — invalidate both caches for parity
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
      // the summary and the raw config view so the editor reflects the new
      // state on next read.
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      queryClient.invalidateQueries({ queryKey: ['configsRaw'] })
      // Every reload also snapshots the replaced on-disk config server-side
      // (hub/executor/backups.go), so a new backup may have appeared.
      queryClient.invalidateQueries({ queryKey: ['configBackups'] })
      // A config reload restarts the engine, so runtime state (drivers,
      // transports, rules, stats, tags, dead letters) may all change.
      // Invalidate them so the UI doesn't show stale data until the next
      // polling interval.
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['deadLetters'] })
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

/**
 * Write operation history (GET /write/history) — the audit trail of every
 * tag write (forward API + reverse stream commands), newest-first, capped
 * server-side at 1000 entries. Polls at the 15s diagnostic cadence used by
 * the other low-urgency queues (deadLetters, rules) — an audit log does
 * not need the 5s stats cadence.
 */
/**
 * Send one test point through a transport (POST /transports/{name}/test).
 * Component-local mutations were an interim measure while the api layer
 * was under parallel ownership; this is the proper home (C-A15 handoff).
 */
export function useTransportTest() {
  return useMutation({
    mutationFn: (name: string) => api.testTransport(name),
  })
}

export function useWriteHistory() {
  return useConnectedQuery({
    queryKey: ['writeHistory'],
    queryFn: api.getWriteHistory,
    refetchInterval: 15000,
  })
}

/**
 * CoreC version (GET /version, public). Static for the process lifetime —
 * the 30s serverInfo cadence is plenty; exists mainly so the Diagnostics
 * health strip shows an authoritative version even before/without a
 * successful authed GET / probe.
 */
export function useVersion() {
  return useConnectedQuery({
    queryKey: ['version'],
    queryFn: api.getVersion,
    refetchInterval: 30000,
  })
}

/**
 * Liveness probe (GET /healthz/live, public) — 200 {"status":"alive"}
 * whenever the process can serve HTTP. 15s matches the diagnostics
 * cadence; k8s probes ~10s, but a UI badge does not need to be hotter.
 */
export function useHealthzLive() {
  return useConnectedQuery({
    queryKey: ['healthzLive'],
    queryFn: api.getHealthzLive,
    refetchInterval: 15000,
  })
}

/**
 * Readiness probe (GET /healthz/ready, public) — resolves to
 * { ready: true } or { ready: false, reason, components } (the endpoint
 * wrapper normalizes the 503 not-ready body). Only transport-level
 * failures land in isError.
 */
export function useHealthzReady() {
  return useConnectedQuery({
    queryKey: ['healthzReady'],
    queryFn: api.getHealthzReady,
    refetchInterval: 15000,
  })
}

/**
 * Driver connectivity test (POST /drivers/test) — spins up a THROWAWAY
 * driver instance server-side with the wizard's current type+settings,
 * measures the connection attempt, and always tears it down. Both
 * outcomes are 200 (connected or not); a rejected request (400) is
 * normalized into { outcome: 'rejected' } by the endpoint wrapper.
 *
 * Intentionally no cache invalidation: the probe registers nothing and
 * persists nothing, so no query can go stale because of it.
 */
export function useDriverTest() {
  return useMutation({
    mutationFn: (req: DriverTestRequest) => api.postDriverTest(req.type, req.settings, req.name),
  })
}

/**
 * Rule preview (POST /rules/preview) — trial-runs the wizard's current
 * match expression against a sample data point in a scratch engine; the
 * active rule set is never touched. Compile/eval errors (400) and
 * unsupported-engine 501s are normalized into { outcome: 'error' } by
 * the endpoint wrapper so the playground can show the message verbatim;
 * only transport-level failures land in isError.
 *
 * Intentionally no cache invalidation: a preview mutates nothing.
 */
export function useRulesPreview() {
  return useMutation({
    mutationFn: (req: RulesPreviewRequest) => api.postRulesPreview(req.match, req.point),
  })
}

// ─── Server-side config backups (/configs/backups*) ─────────────────────

/**
 * Retained server-side config backups (GET /configs/backups), newest
 * first. Not polled: the set changes only on reload-driven snapshots and
 * manual restores, and useUpdateConfig/useRestoreConfigBackup invalidate
 * this key whenever either happens.
 */
export function useConfigBackups() {
  return useConnectedQuery({
    queryKey: ['configBackups'],
    queryFn: api.getConfigBackups,
  })
}

/**
 * Raw YAML text of one backup (GET /configs/backups/{name}) — same
 * plaintext-secrets posture as useConfigRaw, fetched lazily only while
 * the diff dialog for that backup is open (enabled gate).
 */
export function useConfigBackupContent(name: string | undefined) {
  return useConnectedQuery({
    queryKey: ['configBackupContent', name],
    queryFn: () => api.getConfigBackupContent(name as string),
    enabled: !!name,
  })
}

/**
 * Manually snapshot the current on-disk config (POST /configs/backups).
 * Distinct from the automatic pre-overwrite snapshots: this is an explicit
 * operator checkpoint. On created, only the backup list goes stale (the
 * running config did not change).
 */
export function useCreateConfigBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.createConfigBackup(),
    onSuccess: (result) => {
      if (result.outcome !== 'created') return
      queryClient.invalidateQueries({ queryKey: ['configBackups'] })
    },
  })
}

/**
 * Restore a server-side config backup (POST /configs/backups/{name}/restore).
 * The backend replays the backup through the full PUT /configs reload chain,
 * so a success invalidates the same broad runtime surface as useUpdateConfig
 * — plus the backup list itself, which gains the snapshot the restore took
 * of the replaced config. Rejected restores (400/404/503) resolve with
 * { outcome: 'rejected' } instead of erroring, so the panel can show the
 * server's message verbatim.
 */
export function useRestoreConfigBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.restoreConfigBackup(name),
    onSuccess: (result) => {
      if (result.outcome !== 'restored') return
      // Mirror useUpdateConfig: a restore reloads the engine, so every
      // runtime view may change.
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      queryClient.invalidateQueries({ queryKey: ['configsRaw'] })
      queryClient.invalidateQueries({ queryKey: ['configBackups'] })
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
      queryClient.invalidateQueries({ queryKey: ['transports'] })
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['deadLetters'] })
    },
  })
}

// Re-export ApiError so features don't reach into the raw HTTP client (TD-ARCH-008).
// api/client is an internal transport detail; consumers should catch ApiError via this surface.
export { ApiError } from '@/api/client'
// Re-export CoreCWebSocket + WSStatus for consumers that need direct lifecycle control
// (complex useEffect with intertwined local state). Simple consumers should use
// useCoreCWebSocket below instead (TD-ARCH-007).
// Re-export the WS status store surface so manual CoreCWebSocket consumers
// (useTagExplorerStream, the global alert provider) wire into the same
// aggregation the auto-wired hooks use, without reaching into @/stores twice.
export { CoreCWebSocket, makeStreamId, useWsStatusStore, type WSStatus }

/**
 * React hook that manages a CoreCWebSocket lifecycle.
 * Creates the socket on mount (or when path/params change), destroys on cleanup.
 * Callbacks are stored in refs so they can change without triggering reconnects.
 *
 * (TD-ARCH-007 — consumers no longer import @/api/websocket directly.)
 *
 * The socket is ALSO wired into the global WS status store (audit B01/D-02):
 * every status change feeds the AppShell badge + monitor banner, message
 * activity pings the "last update" timestamp (throttled ≥1s in the store),
 * and limiter drops feed the rate-limit hint. Consumer-provided onStatus is
 * chained after the store sink, so existing consumers (charts,
 * RealtimeStreamsPanel) keep working unchanged — this is how /traffic and
 * /memory became visible without touching their components.
 */
export function useCoreCWebSocket<T>(
  path: string,
  params: Record<string, string>,
  onMessage: (data: T) => void,
  onStatus?: (status: WSStatus) => void,
): void {
  const msgRef = useRef(onMessage)
  const statusRef = useRef(onStatus)
  msgRef.current = onMessage
  statusRef.current = onStatus

  const paramsKey = JSON.stringify(params)

  // biome-ignore lint/correctness/useExhaustiveDependencies: paramsKey (JSON.stringify of params) is an intentional stable dep — reconnect only when path or serialized params change, not on every render with a new params object.
  useEffect(() => {
    const id = makeStreamId(path.replace(/^\//, ''))
    let ws: CoreCWebSocket<T> | null = null
    const statusStore = useWsStatusStore.getState()
    const sink = statusStore.registerStream(id)
    statusStore.attachReconnect(id, () => ws?.reconnect())
    ws = new CoreCWebSocket<T>(
      path,
      params,
      (data) => {
        useWsStatusStore.getState().touchStream(id)
        msgRef.current(data)
      },
      (status) => {
        sink(status)
        statusRef.current?.(status)
      },
      (dropped) => useWsStatusStore.getState().reportDropped(id, dropped),
    )
    return () => {
      ws?.destroy()
      useWsStatusStore.getState().unregisterStream(id)
    }
  }, [path, paramsKey])
}
