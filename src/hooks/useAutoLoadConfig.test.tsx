// @vitest-environment jsdom
/**
 * useAutoLoadConfig — D-16 coverage.
 *
 * The AppShell-level hook must be isError-aware: when GET /configs/raw
 * fails (backend just restarted, transient 401, timeout) the store flips
 * to seedStatus 'failed', which blocks the destructive paths
 * (resetToEmpty / useApplyConfig onConfirm) until a retry succeeds.
 * The old behavior silently skipped seeding, so the first "Create" →
 * "Apply" wiped the running control plane.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoLoadConfig } from '@/hooks/useAutoLoadConfig'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'

vi.mock('@/api/activeConnection', () => ({
  getActiveConnection: () => ({
    instanceId: 'test-instance',
    baseUrl: 'http://test',
    secret: 'test-secret',
  }),
  setActiveConnection: vi.fn(),
}))

const SERVER_YAML = `global:
  log-level: info
drivers:
  - name: d1
    type: modbus-tcp
    settings:
      host: 10.0.0.1
    tags:
      - name: t1
        address: "40001"
        type: float32
`

const fetchMock = vi.fn()

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock)
  void i18n.changeLanguage('en')
})

beforeEach(() => {
  localStorage.clear()
  useConfigStore.setState({
    workingConfig: null,
    savedConfig: null,
    dirty: false,
    error: null,
    seedStatus: 'idle',
    seedError: null,
  })
  useConnectionStore.getState().setConnected(true)
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
})

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: Infinity },
    },
  })
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return Wrapper
}

function rawResponse(yaml: string) {
  return new Response(yaml, { status: 200, headers: { 'content-type': 'application/yaml' } })
}

function rawFailure(body = '{"error":"backend restarting"}') {
  return new Response(body, { status: 503, headers: { 'content-type': 'application/json' } })
}

function mockRaw(impl: (input: RequestInfo | URL) => Promise<Response>) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input)
    if (url.includes('/configs/raw')) return impl(input)
    return Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } }))
  })
}

describe('useAutoLoadConfig — D-16 seed failure guard', () => {
  it('marks the seed ready and seeds the store on a successful fetch', async () => {
    mockRaw(() => Promise.resolve(rawResponse(SERVER_YAML)))
    const { result } = renderHook(() => useAutoLoadConfig(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.seedStatus).toBe('ready'))
    expect(result.current.seedBlocked).toBe(false)
    const s = useConfigStore.getState()
    expect(s.workingConfig?.drivers?.[0]?.name).toBe('d1')
    expect(s.savedConfig?.drivers?.[0]?.name).toBe('d1')
  })

  it('marks the seed failed and blocks create/apply when the fetch fails', async () => {
    mockRaw(() => Promise.resolve(rawFailure()))
    const { result } = renderHook(() => useAutoLoadConfig(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.seedStatus).toBe('failed'))
    expect(result.current.seedBlocked).toBe(true)
    // The server's error text is preserved for the banner/diagnostics.
    expect(result.current.seedError).toBe('backend restarting')
    // The store was never seeded: nothing to lose, nothing to wipe with.
    expect(useConfigStore.getState().savedConfig).toBeNull()
    // And the destructive path is blocked.
    expect(useConfigStore.getState().resetToEmpty()).toBe(false)
  })

  it('shows loading status while the fetch is in flight, then failed', async () => {
    let release: (() => void) | undefined
    mockRaw(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(rawFailure())
        }),
    )
    const { result } = renderHook(() => useAutoLoadConfig(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.seedStatus).toBe('loading'))
    expect(result.current.seedBlocked).toBe(true)

    await act(async () => {
      release?.()
    })
    await waitFor(() => expect(result.current.seedStatus).toBe('failed'))
  })

  it('a retry that succeeds lifts the block and seeds the store', async () => {
    let failing = true
    mockRaw(() =>
      failing ? Promise.resolve(rawFailure()) : Promise.resolve(rawResponse(SERVER_YAML)),
    )
    const { result } = renderHook(() => useAutoLoadConfig(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.seedStatus).toBe('failed'))
    expect(result.current.seedBlocked).toBe(true)

    failing = false
    await act(async () => {
      result.current.retry()
    })
    await waitFor(() => expect(result.current.seedStatus).toBe('ready'))
    expect(result.current.seedBlocked).toBe(false)
    expect(useConfigStore.getState().savedConfig?.drivers?.[0]?.name).toBe('d1')
  })

  it('does not flip back to failed once a baseline exists (later refetch failure)', async () => {
    let failing = false
    mockRaw(() =>
      failing ? Promise.resolve(rawFailure()) : Promise.resolve(rawResponse(SERVER_YAML)),
    )
    const { result } = renderHook(() => useAutoLoadConfig(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.seedStatus).toBe('ready'))

    failing = true
    await act(async () => {
      result.current.retry()
    })
    // A background refetch failure after a successful seed keeps the
    // baseline — create/apply stay available.
    await waitFor(() => expect(result.current.seedStatus).not.toBe('loading'))
    expect(result.current.seedStatus).toBe('ready')
    expect(result.current.seedBlocked).toBe(false)
  })
})
