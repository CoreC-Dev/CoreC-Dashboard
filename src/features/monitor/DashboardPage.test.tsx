// @vitest-environment jsdom
// DashboardPage — B-domain audit fixes (B03 dead-letter card honesty, B04
// stale-snapshot banner, B05 online-ratio coloring). The endpoint layer is
// mocked; the REAL react-query hooks run inside a real QueryClient so
// polling/error semantics are exercised. i18n forced to English.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/monitor/DashboardPage'
import i18n from '@/i18n'
import { useAlertStore } from '@/stores/alertStore'
import { useConnectionStore } from '@/stores/connectionStore'
import type { DeadLetterEntry, DriverStatus, EngineStats, TransportStatus } from '@/types/models'

// The dashboard mounts TrafficChart/MemoryChart, whose useCoreCWebSocket
// would open real sockets — a stub class keeps the page inert in jsdom.
vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    constructor(
      _path: string,
      _params: Record<string, string>,
      _onMessage: (data: unknown) => void,
      _onStatus?: (status: string) => void,
      _onDrop?: (count: number) => void,
    ) {}
    destroy = vi.fn()
  },
}))

vi.mock('@/api/endpoints', () => ({
  getStats: vi.fn(),
  getDrivers: vi.fn(),
  getTransports: vi.fn(),
  getDeadLetters: vi.fn(),
}))

import * as api from '@/api/endpoints'

const STATS: EngineStats = {
  status: 'running',
  uptime: 60 * 1e9,
  drivers: 2,
  transports: 1,
  rules: 0,
  total_read: 1234,
  total_publish: 100,
  total_errors: 0,
  total_dropped: 0,
  points_per_sec: 12.4,
}

const driver = (state: number, name = 'plc1'): DriverStatus => ({
  name,
  type: 'modbus',
  state,
  last_read: '',
  last_error: '',
  tag_count: 1,
  read_count: 10,
  error_count: 0,
  reconnect_count: 0,
})

const transport = (state: number, name = 'mqtt1'): TransportStatus => ({
  name,
  type: 'mqtt',
  state,
  published: 5,
  failed: 0,
  received: 0,
  last_publish: '',
  queue_size: 0,
  dropped_commands: 0,
})

const DEAD_LETTER: DeadLetterEntry = {
  command: { driver: 'plc1', device: 'meter-01', tag: 'pump', value: true, type: 'bool' },
  error: 'driver disconnected',
  failed_at: '2026-01-01T00:00:00Z',
  attempts: 3,
}

function renderPage() {
  const qc: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/corec/inst1/monitor/dashboard']}>
        <Routes>
          <Route path="/corec/:id/monitor/dashboard" element={<DashboardPage />} />
          <Route path="/corec/:id/monitor/alerts" element={<div>alerts page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { qc, ...utils }
}

beforeAll(async () => {
  // jsdom ships no window.matchMedia — CountUpNumber probes prefers-reduced-motion.
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
  useAlertStore.setState({ events: [], unreadErrorCount: 0, deadLetterCount: 0, viewing: false })
  // useConnectedQuery gates every hook on connectionStore.isConnected —
  // without this the queries never fire and the page renders empty data.
  useConnectionStore.getState().setConnected(true)
  vi.mocked(api.getStats).mockResolvedValue(STATS)
  vi.mocked(api.getDrivers).mockResolvedValue({
    drivers: [driver(2, 'plc1'), driver(2, 'plc2')],
  })
  vi.mocked(api.getTransports).mockResolvedValue({
    transports: [transport(2)],
  })
  vi.mocked(api.getDeadLetters).mockResolvedValue({ failed_writes: [], count: 0 })
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('DashboardPage — dead-letter card honesty (B03)', () => {
  it('names the card after what it shows and lures to the alerts page with the current error-event count', async () => {
    useAlertStore.setState({
      events: [
        { level: 8, type: 'ERROR', payload: 'driver reset', timestamp: '2026-01-01T12:00:00Z' },
        { level: 4, type: 'WARN', payload: 'backpressure', timestamp: '2026-01-01T12:00:01Z' },
      ],
    })

    renderPage()

    // Title matches the content (failed writes), not a phantom "alerts" claim.
    expect(await screen.findByText('Dead Letter Queue (failed writes)')).toBeTruthy()
    // Only the ERROR-level event is counted, and the badge links to the alerts page.
    const badge = screen.getByText('Error events: 1')
    expect(badge.closest('a')?.getAttribute('href')).toContain('/corec/inst1/monitor/alerts')
  })

  it('shows no error-event badge when the global feed holds no error events', async () => {
    renderPage()

    expect(await screen.findByText('Dead Letter Queue (failed writes)')).toBeTruthy()
    expect(screen.queryByText(/Error events:/)).toBeNull()
  })

  it('empty queue renders a neutral "no failed writes" state, not a health claim', async () => {
    renderPage()

    expect(await screen.findByText('No failed writes recorded')).toBeTruthy()
    expect(screen.queryByText(/All systems healthy/i)).toBeNull()
  })

  it('renders failed-write rows with their retry count', async () => {
    vi.mocked(api.getDeadLetters).mockResolvedValue({ failed_writes: [DEAD_LETTER], count: 1 })

    renderPage()

    expect(await screen.findByText('[plc1] pump = true')).toBeTruthy()
    expect(screen.getByText('3 retries')).toBeTruthy()
  })
})
