// @vitest-environment jsdom
// TD-TEST-005 — ConnectionProvider probe lifecycle: success, failure-kind
// classification (A-01: unauthorized vs unreachable vs timeout), instance-
// not-found, unmount cleanup (AbortError), reconnect(), global 401
// interception with the re-enter-key overlay (D-01), and the 15s periodic
// re-probe (A-21).
//
// The probe hits the authenticated /stats endpoint through the real
// apiRequest, so tests mock global fetch and dispatch on URL:
// /corec-proxy/stats decides the connection verdict, /corec-proxy/ is the
// best-effort info enrichment.
import { useQuery } from '@tanstack/react-query'
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveConnection } from '@/api/activeConnection'
import { ApiError } from '@/api/client'
import { resetProxyMode } from '@/api/proxyMode'
import { ConnectionProvider, useConnection } from '@/contexts/ConnectionContext'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useInstanceStore } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

// Load-tolerant async-assertion timeout: the runner is shared with parallel
// agents on a 2-core host, and RTL waitFor's 1s default flakes under contention.
configure({ asyncUtilTimeout: 4000 })

// Mock the active-connection singleton: setActiveConnection becomes a no-op
// spy and getActiveConnection returns a fixed connection so the real
// apiRequest can build URLs and attach the Bearer token without the
// provider having run its wiring first.
vi.mock('@/api/activeConnection', () => ({
  setActiveConnection: vi.fn(),
  getActiveConnection: () => ({
    instanceId: 'inst-1',
    baseUrl: 'http://test.local',
    secret: 'secret-1',
  }),
}))

// Mock fetch — each test configures the /stats verdict (and optional info).
const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

const STATS_URL = '/corec-proxy/stats'

const instance: CoreCInstance = {
  id: 'inst-1',
  name: 'Test Instance',
  baseUrl: 'http://test.local',
  secret: 'secret-1',
  createdAt: '2024-01-01T00:00:00Z',
  sortOrder: 1,
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const defaultInfo = () =>
  jsonRes({ name: 'test', version: 'dev', status: 'ok', time: '0', uptime: '0s' })

/**
 * Wire the probe responses. `stats` decides the connection verdict;
 * `info` (GET /) only enriches serverInfo and may fail freely.
 */
function mockProbe({ stats, info }: { stats?: Response | Error; info?: Response | Error } = {}) {
  const statsOutcome = stats ?? jsonRes({ drivers: 0 })
  const infoOutcome = info ?? defaultInfo()
  const respond = (outcome: Response | Error) =>
    outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)
  mockFetch.mockImplementation((url: string) =>
    url === STATS_URL ? respond(statsOutcome) : respond(infoOutcome),
  )
}

/** Child that surfaces the connection context value to the DOM. */
function ConnectionConsumer() {
  const ctx = useConnection()
  return (
    <div>
      <span data-testid="isConnected">{String(ctx.isConnected)}</span>
      <span data-testid="isConnecting">{String(ctx.isConnecting)}</span>
      <span data-testid="error">{ctx.error ?? ''}</span>
      <span data-testid="serverInfoName">{ctx.serverInfo?.name ?? ''}</span>
      <button type="button" data-testid="reconnect" onClick={ctx.reconnect}>
        reconnect
      </button>
    </div>
  )
}

const isConnected = () => screen.getByTestId('isConnected').textContent
const isConnecting = () => screen.getByTestId('isConnecting').textContent
const errorText = () => screen.getByTestId('error').textContent
const serverInfoName = () => screen.getByTestId('serverInfoName').textContent

function setInstances(instances: CoreCInstance[]): void {
  useInstanceStore.setState({ instances, probing: {}, probeErrors: {} })
}

function renderProvider(children?: React.ReactNode) {
  return render(<MemoryRouter>{children ?? <ConnectedTestTree />}</MemoryRouter>)
}

/** Default test tree: provider + context consumer. */
const ConnectedTestTree = () => (
  <ConnectionProvider instanceId="inst-1">
    <ConnectionConsumer />
  </ConnectionProvider>
)

/** The fetch call the probe made to /stats (verdict request). */
function statsCall(): [string, RequestInit | undefined] {
  const call = mockFetch.mock.calls.find(([url]) => url === STATS_URL)
  if (!call) throw new Error('probe did not request /stats')
  return [call[0], call[1]]
}

function statsCallCount(): number {
  return mockFetch.mock.calls.filter(([url]) => url === STATS_URL).length
}

beforeEach(() => {
  setInstances([])
  useConnectionStore.setState({ isConnected: false })
  useConfigStore.getState().reset()
  localStorage.clear()
  sessionStorage.clear()
  mockFetch.mockReset()
  resetProxyMode()
  vi.mocked(setActiveConnection).mockClear()
})

// vitest runs without globals:true, so @testing-library/react's auto-cleanup
// (which probes for a global afterEach) never registers. Unmount explicitly
// between tests so providers don't leak into the shared instance store.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Module-level: a component defined inside the test function would
// remount (destroying hook state) on every render — biome 2.6's
// noComponentHookFactories.
function FailingQueryChild() {
  useQuery({
    queryKey: ['will-401'],
    queryFn: () =>
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new ApiError(401, 'API request failed: 401 Unauthorized')), 30)
      }),
    retry: false,
  })
  return <div data-testid="failing-child" />
}

describe('ConnectionProvider (TD-TEST-005)', () => {
  it('successful probe requests /stats with the Bearer token and sets connected', async () => {
    setInstances([instance])
    mockProbe()

    renderProvider()

    await waitFor(() => {
      expect(isConnected()).toBe('true')
    })
    expect(isConnecting()).toBe('false')
    expect(errorText()).toBe('')
    expect(serverInfoName()).toBe('test')
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBeNull()

    // A-01: the probe is authenticated — the Bearer token travels with the
    // verdict request, so a wrong key can no longer pass as "connected".
    const [, init] = statsCall()
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-1')
  })

  it('a 401 from /stats enters the auth-expired overlay state (D-01)', async () => {
    setInstances([instance])
    mockProbe({ stats: jsonRes({ error: 'unauthorized' }, 401) })

    renderProvider()

    // The whole instance UI is replaced by the re-enter-key overlay.
    await waitFor(() => {
      expect(screen.getByText(i18n.t('connection.authExpiredTitle'))).toBeInTheDocument()
    })
    expect(screen.getByText(i18n.t('connection.authExpiredDesc'))).toBeInTheDocument()
    expect(screen.queryByTestId('isConnected')).not.toBeInTheDocument()
    // The failure kind is recorded for the homepage card too.
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBe('unauthorized')
    expect(useInstanceStore.getState().instances[0]?.lastConnectedAt).toBeUndefined()
  })

  it('a network failure from /stats reports unreachable', async () => {
    setInstances([instance])
    mockProbe({ stats: new TypeError('Failed to fetch') })

    renderProvider()

    await waitFor(() => {
      expect(errorText()).toBe(i18n.t('instances.probeUnreachable'))
    })
    expect(isConnected()).toBe('false')
    expect(isConnecting()).toBe('false')
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBe('unreachable')
  })

  it('an aborted /stats request reports timeout', async () => {
    setInstances([instance])
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    mockProbe({ stats: abortErr })

    renderProvider()

    await waitFor(() => {
      expect(errorText()).toBe(i18n.t('instances.probeTimeout'))
    })
    expect(isConnected()).toBe('false')
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBe('timeout')
  })

  it('stays connected when /stats succeeds but the info enrichment fails', async () => {
    setInstances([instance])
    mockProbe({ info: jsonRes({}, 500) })

    renderProvider()

    await waitFor(() => {
      expect(isConnected()).toBe('true')
    })
    expect(errorText()).toBe('')
    // GET / is best-effort enrichment — no serverInfo, but still connected.
    expect(serverInfoName()).toBe('')
  })

  it('missing instance reports the localized not-found error (D-05)', async () => {
    setInstances([])

    renderProvider()

    await waitFor(() => {
      // D-05: ConnectionGate renders `error` verbatim — it must be a
      // translated string, not raw English.
      expect(errorText()).toBe(i18n.t('connection.errInstance'))
    })
    expect(isConnected()).toBe('false')
    expect(isConnecting()).toBe('false')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('unmount aborts the in-flight probe and clears probing state', async () => {
    setInstances([instance])
    const capturedSignals: AbortSignal[] = []
    mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
      const signal = (opts?.signal ?? undefined) as AbortSignal | undefined
      if (signal) capturedSignals.push(signal)
      // Never resolves on its own; rejects when the abort signal fires.
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const result = renderProvider()

    // Probe is in flight → the provider flagged the instance as probing.
    await waitFor(() => {
      expect(useInstanceStore.getState().probing['inst-1']).toBe(true)
    })

    result.unmount()

    // Cleanup (AbortController.abort + setProbing(false)) ran on unmount.
    expect(useInstanceStore.getState().probing['inst-1']).toBe(false)
    // Both in-flight requests were aborted.
    expect(capturedSignals.every((s) => s.aborted)).toBe(true)
    // The abort rejection must not be recorded as a probe failure.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBeUndefined()
    expect(useInstanceStore.getState().instances[0]?.lastKnownInfo).toBeUndefined()
  })

  it('reconnect() triggers a new probe', async () => {
    setInstances([instance])
    mockProbe()

    renderProvider()

    await waitFor(() => {
      expect(serverInfoName()).toBe('test')
    })
    expect(statsCallCount()).toBe(1)

    fireEvent.click(screen.getByTestId('reconnect'))

    await waitFor(() => {
      expect(statsCallCount()).toBe(2)
    })
  })
})

describe('ConnectionProvider — global 401 interception (D-01)', () => {
  /**
   * Child whose query is answered with 401 shortly AFTER the session is
   * established — mirroring the real mid-session scenario (key rotated or
   * revoked server-side while the operator is working). Rejecting in a
   * timeout keeps the initial probe's success commit from racing the 401.
   */

  it('a 401 from any query flips the provider into the auth-expired overlay', async () => {
    setInstances([instance])
    // Probe succeeds — the session looks healthy…
    mockProbe()

    renderProvider(
      <ConnectionProvider instanceId="inst-1">
        <FailingQueryChild />
      </ConnectionProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('failing-child')).toBeInTheDocument()
    })

    // …then a query is answered with 401 → the overlay replaces the app.
    await waitFor(() => {
      expect(screen.getByText(i18n.t('connection.authExpiredTitle'))).toBeInTheDocument()
    })
    expect(screen.queryByTestId('failing-child')).not.toBeInTheDocument()
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBe('unauthorized')
    expect(useConnectionStore.getState().isConnected).toBe(false)
  })

  it('re-entering the key updates the instance secret and restores the app', async () => {
    setInstances([instance])
    // First probe → 401 (bad key); the next probe succeeds (fixed key).
    mockFetch.mockImplementationOnce(() => Promise.resolve(jsonRes({ error: 'unauthorized' }, 401)))
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonRes({ name: 'test', version: 'dev', status: 'ok', time: '0', uptime: '0s' }),
      ),
    )

    renderProvider()

    await waitFor(() => {
      expect(screen.getByText(i18n.t('connection.authExpiredTitle'))).toBeInTheDocument()
    })

    // Reconnect is disabled until a plausible key (≥ 8 chars) is entered.
    const secretInput = screen.getByLabelText(i18n.t('instances.secretToken'))
    const reconnectBtn = screen.getByRole('button', { name: i18n.t('connection.reconnect') })
    expect(reconnectBtn).toBeDisabled()
    fireEvent.change(secretInput, { target: { value: 'short' } })
    expect(reconnectBtn).toBeDisabled()
    fireEvent.change(secretInput, { target: { value: 'new-secret-1' } })
    expect(reconnectBtn).toBeEnabled()

    fireEvent.click(reconnectBtn)

    // The new secret is persisted on the instance…
    await waitFor(() => {
      expect(useInstanceStore.getState().instances[0]?.secret).toBe('new-secret-1')
    })
    // …and the re-probe succeeds → the overlay is gone, the app is back.
    await waitFor(() => {
      expect(screen.getByTestId('isConnected')).toHaveTextContent('true')
    })
    expect(screen.queryByText(i18n.t('connection.authExpiredTitle'))).not.toBeInTheDocument()
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBeNull()
  })

  it('the secondary button navigates back to the instance list', async () => {
    setInstances([instance])
    mockProbe({ stats: jsonRes({ error: 'unauthorized' }, 401) })

    render(
      <MemoryRouter initialEntries={['/corec/inst-1/monitor/dashboard']}>
        <Routes>
          <Route
            path="/corec/:id/*"
            element={
              <ConnectionProvider instanceId="inst-1">
                <ConnectionConsumer />
              </ConnectionProvider>
            }
          />
          <Route path="/" element={<div data-testid="home-route" />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(i18n.t('connection.authExpiredTitle'))).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('connection.backToInstances') }))

    await waitFor(() => {
      expect(screen.getByTestId('home-route')).toBeInTheDocument()
    })
  })
})

describe('ConnectionProvider — periodic re-probe (A-21)', () => {
  it('re-probes every 15s so the indicator follows the backend state', async () => {
    vi.useFakeTimers()
    setInstances([instance])
    mockProbe()

    renderProvider()

    // Initial probe on mount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(statsCallCount()).toBe(1)

    // 15s later the interval fires a second probe…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(statsCallCount()).toBe(2)

    // …and keeps doing so — a backend that recovers flips the indicator
    // back within one interval instead of staying red/green forever.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(statsCallCount()).toBe(3)
    expect(useInstanceStore.getState().probing['inst-1']).toBe(false)
  })

  it('flips from connected to failed within one interval when the backend dies', async () => {
    vi.useFakeTimers()
    setInstances([instance])
    mockProbe()

    renderProvider()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByTestId('isConnected')).toHaveTextContent('true')

    // Backend goes down: subsequent probes fail with a network error.
    mockFetch.mockImplementation((url: string) =>
      url === STATS_URL
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(jsonRes({ name: 'test' })),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    // The green indicator is gone within one interval — no zombie UI.
    // (No waitFor here: under fake timers its internal poll interval
    // would never fire; the advance above already flushed the probe.)
    expect(screen.getByTestId('isConnected')).toHaveTextContent('false')
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBe('unreachable')
  })
})
