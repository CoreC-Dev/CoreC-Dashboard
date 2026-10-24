// @vitest-environment jsdom
// TD-TEST-009 — react-query hook layer: connection gating (useConnectedQuery)
// and mutation cache invalidation. The endpoint functions are mocked so we
// control what data they return; a real QueryClient + QueryClientProvider
// wrapper drives the hooks via @testing-library/react's renderHook.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnectionStore } from '@/stores/connectionStore'
import type { WriteHistoryResponse } from '@/types/api'

// Mock the entire endpoint surface so no real network calls happen and we can
// assert which functions the hooks invoke. The hooks import this module as a
// namespace (`import * as api`), so every named export must be present.
vi.mock('@/api/endpoints', () => ({
  getServerInfo: vi.fn(),
  getDrivers: vi.fn(),
  getDriver: vi.fn(),
  getDriverTags: vi.fn(),
  getTransports: vi.fn(),
  getTransport: vi.fn(),
  getTags: vi.fn(),
  getRules: vi.fn(),
  getStats: vi.fn(),
  getConfigs: vi.fn(),
  getConfigsRaw: vi.fn(),
  createConfigBackup: vi.fn(),
  getConfigBackups: vi.fn(),
  restoreConfigBackup: vi.fn(),
  getDeadLetters: vi.fn(),
  getMetricsText: vi.fn(),
  getWriteHistory: vi.fn(),
  getWriteHistoryFiltered: vi.fn(),
  getVersion: vi.fn(),
  getHealthzLive: vi.fn(),
  getHealthzReady: vi.fn(),
  writeTag: vi.fn(),
  toggleRule: vi.fn(),
  patchConfigs: vi.fn(),
  updateConfigs: vi.fn(),
  validateConfigs: vi.fn(),
  postDriverTest: vi.fn(),
  postRulesPreview: vi.fn(),
}))

import * as api from '@/api/endpoints'
import {
  useConfigBackups,
  useCreateConfigBackup,
  useDriver,
  useDriverTest,
  usePatchConfig,
  useRestoreConfigBackup,
  useRulesPreview,
  useServerInfo,
  useToggleRule,
  useUpdateConfig,
  useWriteHistory,
  useWriteTag,
} from '@/api/hooks'
import type {
  ConfigBackupCreateResult,
  ConfigBackupRestoreResult,
  DriverTestResult,
  RulesPreviewResult,
} from '@/types/api'

// One QueryClient per test, provided via a wrapper. retry:false keeps failed
// queries from looping; staleTime:0 lets invalidation/refetch assertions stay
// deterministic.
let queryClient: QueryClient

// Module-level test provider (biome 2.6 noComponentHookFactories: a
// component defined inside a function remounts its subtree on every
// parent render — in tests that would silently reset hook state between
// assertions). The client arrives via prop so each test keeps its own.
function QueryWrapper({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function createWrapper() {
  return ({ children }: { children: ReactNode }) => (
    <QueryWrapper client={queryClient}>{children}</QueryWrapper>
  )
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  // Start every test disconnected; individual tests opt in.
  useConnectionStore.setState({ isConnected: false })
  vi.clearAllMocks()
})

afterEach(() => {
  // Explicitly unmount rendered hooks: @testing-library/react's auto-cleanup
  // does not run under this repo's vitest setup, and useConnectionStore is a
  // global zustand store — a lingering mount from a prior test would re-enable
  // and fetch when a later test flips isConnected, double-counting calls.
  cleanup()
  queryClient.clear()
})

describe('useConnectedQuery — connection gating (TD-TEST-009)', () => {
  it('skips the query (never calls the endpoint) when isConnected is false', async () => {
    vi.mocked(api.getServerInfo).mockResolvedValue({
      name: 'corec',
      version: '1.0',
      status: 'ok',
      time: '2026-01-01T00:00:00Z',
      uptime: '1h',
    })

    const { result } = renderHook(() => useServerInfo(), {
      wrapper: createWrapper(),
    })

    // Disabled queries sit in pending + idle fetchStatus and never invoke the fn.
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getServerInfo).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(true)
    expect(result.current.isSuccess).toBe(false)
  })

  it('fetches the endpoint when isConnected is true', async () => {
    const info = {
      name: 'corec',
      version: '1.2.3',
      status: 'ok',
      time: '2026-01-01T00:00:00Z',
      uptime: '1h',
    }
    vi.mocked(api.getServerInfo).mockResolvedValue(info)
    useConnectionStore.setState({ isConnected: true })

    const { result } = renderHook(() => useServerInfo(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getServerInfo).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(info)
  })

  it('skips when enabled is false even while connected (useDriver with empty name)', async () => {
    vi.mocked(api.getDriver).mockResolvedValue({
      name: 'x',
      type: 'modbus-tcp',
      state: 2,
      last_read: '',
      last_error: '',
      tag_count: 0,
      read_count: 0,
      error_count: 0,
      reconnect_count: 0,
    })
    useConnectionStore.setState({ isConnected: true })

    const { result } = renderHook(() => useDriver(''), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getDriver).not.toHaveBeenCalled()
  })

  it('fetches when both isConnected is true and enabled is true (useDriver with name)', async () => {
    const status = {
      name: 'plc1',
      type: 'modbus-tcp',
      state: 2,
      last_read: '2026-01-01T00:00:00Z',
      last_error: '',
      tag_count: 1,
      read_count: 10,
      error_count: 0,
      reconnect_count: 0,
    }
    vi.mocked(api.getDriver).mockResolvedValue(status)
    useConnectionStore.setState({ isConnected: true })

    const { result } = renderHook(() => useDriver('plc1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getDriver).toHaveBeenCalledWith('plc1')
    expect(result.current.data).toEqual(status)
  })
})

describe('mutation cache invalidation (TD-TEST-009)', () => {
  it('useWriteTag invalidates tags, deadLetters, writeHistory, and the written driver tags+status', async () => {
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useWriteTag(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({
        driver: 'plc1',
        tag: 'temp',
        value: 50,
        type: 'float32',
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['deadLetters'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['writeHistory'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['driverTags', 'plc1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['driver', 'plc1'] })
  })

  it('useToggleRule invalidates the rules query on success', async () => {
    vi.mocked(api.toggleRule).mockResolvedValue(undefined)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useToggleRule(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ name: 'overtemp-alarm', disabled: true })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['rules'] })
  })

  it('usePatchConfig invalidates configs and configsRaw on success', async () => {
    vi.mocked(api.patchConfigs).mockResolvedValue(undefined)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => usePatchConfig(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ 'log-level': 'debug' })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configs'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configsRaw'] })
  })

  it('useUpdateConfig invalidates configs and configsRaw on success', async () => {
    vi.mocked(api.updateConfigs).mockResolvedValue(undefined)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateConfig(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ payload: 'node:\n  id: edge\n' })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configs'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configsRaw'] })
    // Every reload snapshots the replaced on-disk config server-side, so
    // the backup list may have gained an entry.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configBackups'] })
  })
})

// ─── Server-side config backups ─────────────────────────────────────────

describe('useConfigBackups / useRestoreConfigBackup — config backup timeline', () => {
  const backups = {
    backups: [{ name: '1767225600123456789.yaml', timestamp: '2026-01-01T00:00:00Z', size: 1024 }],
  }

  it('fetches the backup list when connected and returns the parsed data', async () => {
    vi.mocked(api.getConfigBackups).mockResolvedValue(backups)
    useConnectionStore.setState({ isConnected: true })

    const { result } = renderHook(() => useConfigBackups(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getConfigBackups).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(backups)
  })

  it('skips the backup list query when disconnected (useConnectedQuery gating)', async () => {
    vi.mocked(api.getConfigBackups).mockResolvedValue(backups)
    useConnectionStore.setState({ isConnected: false })

    const { result } = renderHook(() => useConfigBackups(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getConfigBackups).not.toHaveBeenCalled()
  })

  it('useRestoreConfigBackup invalidates the config surface AND the backup list on success', async () => {
    // A restore reloads the engine (same chain as PUT /configs) and the
    // server snapshots the replaced config — both the runtime views and
    // the backup list go stale.
    const restored: ConfigBackupRestoreResult = { outcome: 'restored' }
    vi.mocked(api.restoreConfigBackup).mockResolvedValue(restored)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRestoreConfigBackup(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync('1767225600123456789.yaml')
    })

    expect(api.restoreConfigBackup).toHaveBeenCalledWith('1767225600123456789.yaml')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configs'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configsRaw'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configBackups'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['drivers'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['deadLetters'] })
  })

  it('useRestoreConfigBackup resolves a rejected restore as data and invalidates nothing', async () => {
    // A 400 validation refusal leaves the running config untouched — no
    // cache can have gone stale, so the mutation must not invalidate.
    const rejected: ConfigBackupRestoreResult = {
      outcome: 'rejected',
      status: 400,
      error: 'config backup failed validation: api.secret must be set',
    }
    vi.mocked(api.restoreConfigBackup).mockResolvedValue(rejected)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRestoreConfigBackup(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync('1767225600123456789.yaml')
    })

    await waitFor(() => expect(result.current.data).toEqual(rejected))
    expect(result.current.isError).toBe(false)
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('useCreateConfigBackup invalidates only the backup list on created', async () => {
    // A manual snapshot does not touch the running config, so only the
    // backup list goes stale.
    const created: ConfigBackupCreateResult = {
      outcome: 'created',
      name: '1767225600123456789.yaml',
    }
    vi.mocked(api.createConfigBackup).mockResolvedValue(created)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateConfigBackup(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(api.createConfigBackup).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['configBackups'] })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['configs'] })
  })

  it('useCreateConfigBackup resolves a rejected snapshot as data and invalidates nothing', async () => {
    const rejected: ConfigBackupCreateResult = {
      outcome: 'rejected',
      status: 404,
      error: 'active config file not found on disk',
    }
    vi.mocked(api.createConfigBackup).mockResolvedValue(rejected)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateConfigBackup(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync()
    })

    await waitFor(() => expect(result.current.data).toEqual(rejected))
    expect(result.current.isError).toBe(false)
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('surfaces a transport-level restore failure as isError', async () => {
    vi.mocked(api.restoreConfigBackup).mockRejectedValue(new Error('network unreachable'))

    const { result } = renderHook(() => useRestoreConfigBackup(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync('1767225600123456789.yaml').catch(() => {})
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useWriteHistory — write audit trail', () => {
  const history: WriteHistoryResponse = {
    writes: [
      {
        timestamp: '2026-01-01T12:00:00Z',
        driver: 'plc1',
        device: '',
        tag: 'temp',
        value: 50,
        type: 'float32',
        success: true,
        source: 'api',
        remote: '192.168.1.10:51424',
      },
    ],
    count: 1,
  }

  it('fetches the write history when connected and returns the parsed data', async () => {
    vi.mocked(api.getWriteHistoryFiltered).mockResolvedValue(history)
    useConnectionStore.setState({ isConnected: true })

    const { result } = renderHook(() => useWriteHistory(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getWriteHistoryFiltered).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(history)
  })

  it('skips the query when disconnected (useConnectedQuery gating)', async () => {
    vi.mocked(api.getWriteHistoryFiltered).mockResolvedValue(history)
    useConnectionStore.setState({ isConnected: false })

    const { result } = renderHook(() => useWriteHistory(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(api.getWriteHistoryFiltered).not.toHaveBeenCalled()
  })

  it('surfaces an endpoint failure as isError (zod/transport errors alike)', async () => {
    vi.mocked(api.getWriteHistoryFiltered).mockRejectedValue(new Error('write history unavailable'))
    useConnectionStore.setState({ isConnected: true })

    const { result } = renderHook(() => useWriteHistory(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('useWriteTag invalidating writeHistory refetches the ACTIVE history query', async () => {
    // The audit trail must reflect a fresh write immediately: the mutation
    // invalidates ['writeHistory'], which refetches the mounted query
    // without waiting for the 15s poll.
    vi.mocked(api.getWriteHistoryFiltered).mockResolvedValue(history)
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    useConnectionStore.setState({ isConnected: true })

    const { result: historyQuery } = renderHook(() => useWriteHistory(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(historyQuery.current.isSuccess).toBe(true))
    expect(api.getWriteHistoryFiltered).toHaveBeenCalledTimes(1)

    const { result: write } = renderHook(() => useWriteTag(), {
      wrapper: createWrapper(),
    })
    await act(async () => {
      await write.current.mutateAsync({ driver: 'plc1', tag: 'temp', value: 1, type: 'int16' })
    })

    await waitFor(() => expect(api.getWriteHistoryFiltered).toHaveBeenCalledTimes(2))
  })
})

describe('useDriverTest — connectivity probe mutation', () => {
  const connected: DriverTestResult = {
    outcome: 'completed',
    data: { ok: true, connected: true, latency_ms: 12, driver_type: 'modbus-tcp' },
  }

  it('calls postDriverTest with the wizard form values and surfaces the result', async () => {
    vi.mocked(api.postDriverTest).mockResolvedValue(connected)

    const { result } = renderHook(() => useDriverTest(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({
        type: 'modbus-tcp',
        settings: { host: '10.0.0.5', port: 502 },
        name: 'plc-line-2-probe',
      })
    })

    expect(api.postDriverTest).toHaveBeenCalledWith(
      'modbus-tcp',
      { host: '10.0.0.5', port: 502 },
      'plc-line-2-probe',
    )
    await waitFor(() => expect(result.current.data).toEqual(connected))
    expect(result.current.isError).toBe(false)
  })

  it('resolves a completed-but-disconnected probe as a normal result (not an error)', async () => {
    // Both /drivers/test outcomes are 200: a failed connection is a
    // finished test — the hook must not put it in the error state.
    const failed: DriverTestResult = {
      outcome: 'completed',
      data: {
        ok: false,
        connected: false,
        error: 'dial tcp 10.0.0.5:502: connection refused',
        latency_ms: 3,
        driver_type: 'modbus-tcp',
      },
    }
    vi.mocked(api.postDriverTest).mockResolvedValue(failed)

    const { result } = renderHook(() => useDriverTest(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ type: 'modbus-tcp', settings: {} })
    })

    await waitFor(() => expect(result.current.data).toEqual(failed))
    expect(result.current.isError).toBe(false)
  })

  it('surfaces transport-level failures as isError (no invalidation, no retry)', async () => {
    vi.mocked(api.postDriverTest).mockRejectedValue(new Error('network unreachable'))

    const { result } = renderHook(() => useDriverTest(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ type: 'modbus-tcp', settings: {} }).catch(() => {})
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(api.postDriverTest).toHaveBeenCalledTimes(1)
  })
})

describe('useRulesPreview — offline playground mutation', () => {
  const point = {
    driver: 'plc1',
    device: '',
    group: '',
    tag: 'temperature',
    value: 96.5,
    type: 'float64' as const,
    quality: 0,
    timestamp: '2024-09-08T10:30:00Z',
  }

  it('calls postRulesPreview with the expression and the sample point', async () => {
    const result: RulesPreviewResult = { outcome: 'evaluated', matched: true }
    vi.mocked(api.postRulesPreview).mockResolvedValue(result)

    const { result: hook } = renderHook(() => useRulesPreview(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await hook.current.mutateAsync({ match: 'value > 95', point })
    })

    expect(api.postRulesPreview).toHaveBeenCalledWith('value > 95', point)
    await waitFor(() => expect(hook.current.data).toEqual(result))
    expect(hook.current.isError).toBe(false)
  })

  it('resolves a compile error as data (not isError) so the UI shows it verbatim', async () => {
    const result: RulesPreviewResult = {
      outcome: 'error',
      status: 400,
      error: 'failed to create rule preview: invalid match expression "tag =="',
    }
    vi.mocked(api.postRulesPreview).mockResolvedValue(result)

    const { result: hook } = renderHook(() => useRulesPreview(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await hook.current.mutateAsync({ match: 'tag ==' })
    })

    await waitFor(() => expect(hook.current.data).toEqual(result))
    expect(hook.current.isError).toBe(false)
  })

  it('surfaces transport-level failures as isError', async () => {
    vi.mocked(api.postRulesPreview).mockRejectedValue(new Error('network unreachable'))

    const { result } = renderHook(() => useRulesPreview(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ match: 'ALL' }).catch(() => {})
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
