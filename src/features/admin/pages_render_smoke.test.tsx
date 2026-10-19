// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from '@/features/admin/DiagnosticsPage'
import { RulesPage } from '@/features/admin/RulesPage'
import { TransportsPage } from '@/features/admin/TransportsPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

// Mock only the API layer (no real network). Stores are REAL — the test
// validates that useConfigStore selectors don't create new references on
// every getSnapshot call (the #185 "Maximum update depth exceeded" bug).
vi.mock('@/api/endpoints', () => ({
  getTransports: vi.fn().mockResolvedValue({
    transports: [
      {
        name: 'webhook-in',
        type: 'http',
        state: 2,
        published: 0,
        failed: 0,
        received: 0,
        last_publish: '0001-01-01T00:00:00Z',
        queue_size: 0,
        dropped_commands: 0,
      },
    ],
  }),
  getRules: vi.fn().mockResolvedValue({
    rules: [
      {
        index: 0,
        name: 'forward-all',
        match: 'data_point.name == "*"',
        action: 'forward',
        target: 'webhook-in',
        priority: 100,
        disabled: false,
        matched: 0,
        fired: 0,
      },
    ],
  }),
  getConfigs: vi.fn().mockResolvedValue({ redacted: true }),
  getServerInfo: vi.fn().mockResolvedValue({ name: 'test', version: 'dev' }),
  getStats: vi.fn().mockResolvedValue({}),
  getDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  getDeadLetters: vi.fn().mockResolvedValue({ dead_letters: [] }),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
  getConfigsRaw: vi.fn().mockResolvedValue('node:\n  id: test\n'),
  validateConfigs: vi.fn().mockResolvedValue({ valid: true }),
  // DiagnosticsPage surface: metrics text, write audit trail, and the
  // public instance-health probes (version / healthz live+ready).
  getMetricsText: vi
    .fn()
    .mockResolvedValue(
      '# HELP corec_goroutines Goroutines\ncorec_goroutines 42\n' +
        '# HELP corec_driver_read_total Reads\ncorec_driver_read_total{driver="plc1",type="modbus-tcp"} 100\n',
    ),
  getWriteHistory: vi.fn().mockResolvedValue({ writes: [], count: 0 }),
  getVersion: vi.fn().mockResolvedValue({ version: '0.9.2-mock' }),
  getHealthzLive: vi.fn().mockResolvedValue({ status: 'alive' }),
  getHealthzReady: vi.fn().mockResolvedValue({ ready: true }),
}))

// The real-time terminal on the Diagnostics page is an xterm.js Terminal
// fed by the /logs WebSocket — neither can run under jsdom (the renderer
// stack needs real DOM measurement; jsdom has no WebSocket server to
// connect to). Stub the three leaf modules; the REAL EventLogTerminal
// component still mounts, so the page smoke covers everything around the
// stream (banner, cards, tables) while the terminal/stream stay inert.
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    open = vi.fn()
    loadAddon = vi.fn()
    writeln = vi.fn()
    clear = vi.fn()
    dispose = vi.fn()
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
    dispose = vi.fn()
  },
}))
vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    destroy = vi.fn()
  },
}))

// Mock the active connection module so apiRequest has credentials.
vi.mock('@/api/activeConnection', () => ({
  getActiveConnection: () => ({
    instanceId: 'test-instance',
    baseUrl: 'http://test',
    secret: 'test-secret',
  }),
  setActiveConnection: vi.fn(),
}))

// Mock the ConnectionContext so useConnection() returns a connected state.
const _connCtx = {
  instance: {
    id: 'test-instance',
    name: 'Test Instance',
    baseUrl: 'http://test',
    secret: 'test-secret',
    createdAt: new Date().toISOString(),
    sortOrder: 1,
  },
  isConnected: true,
  isConnecting: false,
  error: null,
  serverInfo: { name: 'test', version: 'dev' },
  reconnect: vi.fn(),
}
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => _connCtx,
  ConnectionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

function wrap(el: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, staleTime: Infinity } },
  })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>
  )
}

// Force English so content assertions are readable and deterministic,
// independent of the localStorage-backed default locale (zh-CN).
// Mark the connection as connected via the REAL connection store (kept real to
// preserve the #185 selector-stability regression check) so useConnectedQuery
// enables the mocked transports/rules queries instead of staying idle.
beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

// vitest runs without globals:true, so @testing-library/react's auto-cleanup
// never registers — clean up explicitly between tests.
afterEach(() => {
  cleanup()
})

// These pages render heavy card grids; under full-suite load on a 2-core
// box (parallel agent workstreams) they can exceed the 5s default. 15s
// mirrors the BatchWritePanel suite-timeout precedent.
vi.setConfig({ testTimeout: 15_000 })

describe('render smoke (#185 regression)', () => {
  it('TransportsPage renders without infinite loop', async () => {
    let container: ReturnType<typeof render> | undefined
    act(() => {
      container = render(wrap(<TransportsPage />))
    })
    expect(container?.container).toBeTruthy()
    // Static page chrome renders synchronously — an empty <div> would fail here.
    expect(screen.getByText('Northbound Transports')).toBeTruthy()
    expect(screen.getByText('Runtime Status')).toBeTruthy()
    expect(screen.getByText('Create Transport')).toBeTruthy()
    // Transport rows appear after the mocked useTransports query resolves.
    expect(await screen.findByText('webhook-in')).toBeTruthy()
  })

  it('RulesPage renders without infinite loop', async () => {
    let container: ReturnType<typeof render> | undefined
    act(() => {
      container = render(wrap(<RulesPage />))
    })
    expect(container?.container).toBeTruthy()
    // Static page chrome renders synchronously — an empty <div> would fail here.
    expect(screen.getByText('Rule Pipeline & Routing')).toBeTruthy()
    expect(screen.getByText('Runtime Rules')).toBeTruthy()
    expect(screen.getByText('Create Rule')).toBeTruthy()
    // Rule rows appear after the mocked useRules query resolves.
    expect(await screen.findByText('forward-all')).toBeTruthy()
  })

  it('DiagnosticsPage renders with the WS terminal and stream stubbed', async () => {
    // The page's own queries (metrics, version, healthz, write history)
    // are served by the '@/api/endpoints' mock above; the xterm.js
    // terminal and the /logs CoreCWebSocket are inert module stubs (see
    // the vi.mock calls at the top) — jsdom can host neither. The REAL
    // EventLogTerminal component still mounts, proving the page wires
    // the terminal section without a real socket.
    let container: ReturnType<typeof render> | undefined
    act(() => {
      container = render(wrap(<DiagnosticsPage />))
    })
    expect(container?.container).toBeTruthy()
    // Static page chrome renders synchronously — an empty <div> would fail here.
    expect(screen.getByText('Observability & Diagnostics')).toBeTruthy()
    expect(screen.getByText('Prometheus Runtime Metrics')).toBeTruthy()
    // The terminal card mounts against the stubbed Terminal/CoreCWebSocket.
    expect(screen.getByText('CoreC Real-time Event Stream')).toBeTruthy()
    // C-E1: anchor chips render and pprof stays folded by default —
    // the deep behavior lives in DiagnosticsAnchors.test.
    expect(screen.getByTestId('section-anchor-nav')).toBeTruthy()
    expect(screen.getByText('Advanced debugging (pprof) (developers)')).toBeTruthy()
    expect(screen.queryByText('/debug/pprof/heap')).toBeNull()
    // Metrics query resolved: the goroutines tile shows the scraped value
    // and the per-driver read table gets its row.
    expect(await screen.findByText('42')).toBeTruthy()
    expect(await screen.findByText('plc1')).toBeTruthy()
    // InstanceHealthBar resolved the mocked public probes.
    expect(await screen.findByText('v0.9.2-mock')).toBeTruthy()
  })
})
