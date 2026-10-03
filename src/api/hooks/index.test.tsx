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
  getDeadLetters: vi.fn(),
  getMetricsText: vi.fn(),
  writeTag: vi.fn(),
  toggleRule: vi.fn(),
  patchConfigs: vi.fn(),
  updateConfigs: vi.fn(),
  validateConfigs: vi.fn(),
}))

import * as api from '@/api/endpoints'
import {
  useDriver,
  usePatchConfig,
  useServerInfo,
  useToggleRule,
  useUpdateConfig,
  useWriteTag,
} from '@/api/hooks'

// One QueryClient per test, provided via a wrapper. retry:false keeps failed
// queries from looping; staleTime:0 lets invalidation/refetch assertions stay
// deterministic.
let queryClient: QueryClient

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
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
  it('useWriteTag invalidates tags, deadLetters, and the written driver tags+status', async () => {
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
      await result.current.mutateAsync({ index: 2, disabled: true })
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
  })
})
