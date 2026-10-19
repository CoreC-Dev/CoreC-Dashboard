// @vitest-environment jsdom
// DashboardPage — B-domain audit fixes (B03 dead-letter card honesty, B04
// stale-snapshot banner, B05 online-ratio coloring). The endpoint layer is
// mocked; the REAL react-query hooks run inside a real QueryClient so
// polling/error semantics are exercised. i18n forced to English.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// Shared-tree CI runs up to a dozen jsdom workers at once; the multi-step
// dialog/page interactions here can outlive vitest's 5s default testTimeout
// even while every wait is already patience-tuned via asyncUtilTimeout.
vi.setConfig({ testTimeout: 15_000 })

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

  it('the row-5 header link reads "View All" and points at the alerts page (B14)', async () => {
    renderPage()

    expect(await screen.findByText('Dead Letter Queue (failed writes)')).toBeTruthy()
    // Not a third "Manage" clone — the link says view-all and means the
    // alerts page.
    const link = screen.getByText('View All').closest('a')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toContain('/corec/inst1/monitor/alerts')
    expect(screen.queryAllByText('Manage')).toHaveLength(2) // driver + transport rows only
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
    expect(screen.getByText('Retries: 3')).toBeTruthy()
  })
})

describe('DashboardPage — stale snapshot instead of page collapse (B04)', () => {
  it('keeps the last good data and shows a retry banner when a refresh fails', async () => {
    const { qc } = renderPage()
    expect(await screen.findByText('Dead Letter Queue (failed writes)')).toBeTruthy()
    // Real data rendered (total publish from the stats snapshot).
    expect(screen.getByText('Pub: 100')).toBeTruthy()
    expect(screen.queryByText(/Refresh failed/)).toBeNull()

    // Next poll fails — the page must NOT collapse into the full-page error.
    vi.mocked(api.getStats).mockRejectedValue(new Error('network down'))
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['stats'] })
    })

    expect(await screen.findByText(/Refresh failed — showing snapshot from/)).toBeTruthy()
    // The snapshot data is still on screen.
    expect(screen.getByText('Pub: 100')).toBeTruthy()
    expect(screen.queryByText('Failed to load dashboard data')).toBeNull()

    // Manual retry re-fires the query instead of waiting for the 5s poll.
    const callsBefore = vi.mocked(api.getStats).mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })
    await waitFor(() =>
      expect(vi.mocked(api.getStats).mock.calls.length).toBeGreaterThan(callsBefore),
    )
  })

  it('the stale banner clears itself once a refresh succeeds again', async () => {
    const { qc } = renderPage()
    expect(await screen.findByText('Pub: 100')).toBeTruthy()

    vi.mocked(api.getStats).mockRejectedValueOnce(new Error('network down'))
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['stats'] })
    })
    expect(await screen.findByText(/Refresh failed — showing snapshot from/)).toBeTruthy()

    // The manual retry now lands on the healthy mock — banner auto-dismisses.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })
    await waitFor(() =>
      expect(screen.queryByText(/Refresh failed — showing snapshot from/)).toBeNull(),
    )
    expect(screen.getByText('Pub: 100')).toBeTruthy()
  })

  it('still falls back to the full-page error only when the FIRST load fails with no data', async () => {
    vi.mocked(api.getStats).mockRejectedValue(new Error('server down'))

    renderPage()

    expect(await screen.findByText('Failed to load dashboard data')).toBeTruthy()
    expect(screen.queryByText(/Refresh failed/)).toBeNull()
    expect(screen.queryByText('Dead Letter Queue (failed writes)')).toBeNull()
  })
})

describe('DashboardPage — sample-rate honesty (B12)', () => {
  it('renders the fractional points/sec verbatim instead of rounding it away', async () => {
    // jsdom's rAF timestamps come from a clock offset seconds away from
    // performance.now(), which corrupts the eased mid-animation values — so
    // assert on the reduced-motion path, which snaps straight to the target
    // (exactly what a reduced-motion user sees).
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    try {
      renderPage()

      // 12.4 pts/s must stay 12.4 — the old pipeline rounded inside
      // CountUpNumber before the one-decimal format ever saw the value.
      expect(await screen.findByText('12.4')).toBeTruthy()
    } finally {
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    }
  })
})

describe('DashboardPage — status honesty (B13)', () => {
  it('renders a missing status as amber "Unknown", never a green "running" claim', async () => {
    vi.mocked(api.getStats).mockResolvedValue({ ...STATS, status: '' })

    renderPage()

    const label = await screen.findByText('Unknown')
    // The dot beside the label is amber, not the green running glow —
    // "don't know" must not look like "healthy" during a night scan.
    expect(label.previousElementSibling?.className).toContain('bg-status-warning')
    expect(label.previousElementSibling?.className).not.toContain('bg-status-running')
    expect(screen.queryByText('Running')).toBeNull()
  })

  it('keeps the green running glow only for an actual running/ok status', async () => {
    renderPage() // STATS ships status: 'running'

    const label = await screen.findByText('running')
    expect(label.previousElementSibling?.className).toContain('bg-status-running')
  })
})

describe('DashboardPage — online-ratio coloring (B05)', () => {
  const toneClassOf = (el: HTMLElement) => el.className

  it('100% online renders green with the "100% online" label', async () => {
    renderPage()

    const label = await screen.findByText('100% online')
    expect(toneClassOf(label)).toContain('text-status-running')
    expect(screen.getByText('100% connected').className).toContain('text-status-running')
  })

  it('partial outage renders amber with the percentage visible', async () => {
    vi.mocked(api.getDrivers).mockResolvedValue({
      drivers: [driver(2, 'plc1'), driver(0, 'plc2')],
    })
    vi.mocked(api.getTransports).mockResolvedValue({
      transports: [transport(0), transport(2, 'http1')],
    })

    renderPage()

    const driversLabel = await screen.findByText('50% online')
    expect(toneClassOf(driversLabel)).toContain('text-status-warning')
    const transportsLabel = screen.getByText('50% connected')
    expect(toneClassOf(transportsLabel)).toContain('text-status-warning')
  })

  it('full outage renders red and says "All offline" / "All disconnected"', async () => {
    vi.mocked(api.getDrivers).mockResolvedValue({
      drivers: [driver(0, 'plc1'), driver(0, 'plc2')],
    })
    vi.mocked(api.getTransports).mockResolvedValue({
      transports: [transport(0)],
    })

    renderPage()

    const driversLabel = await screen.findByText('All offline')
    expect(toneClassOf(driversLabel)).toContain('text-status-error')
    const transportsLabel = screen.getByText('All disconnected')
    expect(toneClassOf(transportsLabel)).toContain('text-status-error')
    expect(screen.queryByText(/% online/)).toBeNull()
  })

  it('no configured drivers/transports renders a muted N/A, not a green claim', async () => {
    vi.mocked(api.getDrivers).mockResolvedValue({ drivers: [] })
    vi.mocked(api.getTransports).mockResolvedValue({ transports: [] })

    renderPage()

    const labels = await screen.findAllByText('N/A')
    expect(labels).toHaveLength(2)
    for (const label of labels) {
      expect(label.className).toContain('text-muted-foreground')
      expect(label.className).not.toContain('text-status-running')
    }
  })
})
