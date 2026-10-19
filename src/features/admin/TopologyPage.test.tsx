// @vitest-environment jsdom
// Topology-page behavior tests (C-E4 flow/hover, C-E5 loading states,
// C-E6 row links, C-E7 per-query errors).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TopologyPage } from '@/features/admin/TopologyPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => {
  const drivers = [
    {
      name: 'plc1',
      type: 'modbus-tcp',
      state: 2,
      last_read: '0001-01-01T00:00:00Z',
      last_error: '',
      tag_count: 10,
      read_count: 5,
      error_count: 0,
      reconnect_count: 0,
    },
  ]
  const transports = [
    {
      name: 'mqtt-out',
      type: 'mqtt',
      state: 2,
      published: 1,
      failed: 0,
      received: 0,
      last_publish: '0001-01-01T00:00:00Z',
      queue_size: 0,
      dropped_commands: 0,
    },
  ]
  const rules = [
    {
      index: 0,
      name: 'hot-rule',
      match: 'driver == "plc1" && value > 80',
      action: 'forward',
      target: 'mqtt-out',
      priority: 10,
      disabled: false,
      hit_count: 0,
      miss_count: 0,
    },
  ]
  return {
    getDrivers: vi.fn().mockResolvedValue({ drivers }),
    getTransports: vi.fn().mockResolvedValue({ transports }),
    getRules: vi.fn().mockResolvedValue({ rules }),
    getStats: vi.fn().mockResolvedValue({ status: 'running', uptime: 10 }),
    getServerInfo: vi.fn().mockResolvedValue({ name: 'corec', version: 'dev' }),
    getConfigs: vi.fn().mockResolvedValue({ global: {} }),
    getConfigsRaw: vi.fn().mockResolvedValue('drivers: []\n'),
  }
})

function renderPage(initialEntry = '/corec/i1/admin/topology') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, staleTime: Infinity } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/corec/:id/admin/topology" element={<TopologyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

describe('TopologyPage — data flow (C-E4)', () => {
  it('plain-language title/subtitle replace the hexagon jargon (C-G4)', async () => {
    renderPage()
    expect(await screen.findByText('Data Flow Topology')).toBeTruthy()
    expect(
      screen.getByText('Live overview: southbound devices → engine → rules → northbound sinks'),
    ).toBeTruthy()
  })

  it('hovering a driver lights its rules and their target transports', async () => {
    renderPage()

    const driverRow = await screen.findByTestId('topo-driver-plc1')
    const hotRule = await screen.findByTestId('topo-rule-hot-rule')
    const transportRow = screen.getByTestId('topo-transport-mqtt-out')

    expect(driverRow.className).not.toContain('border-primary/60')
    expect(hotRule.className).not.toContain('border-primary/70')
    expect(transportRow.className).not.toContain('border-primary/60')

    await act(async () => {
      fireEvent.mouseEnter(driverRow)
    })

    // The plc1 rule lights up and so does the transport it targets —
    // the driver → rule → transport flow becomes visible.
    expect(driverRow.className).toContain('border-primary/60')
    expect(hotRule.className).toContain('border-primary/70')
    expect(transportRow.className).toContain('border-primary/60')

    await act(async () => {
      fireEvent.mouseLeave(driverRow)
    })
    expect(driverRow.className).not.toContain('border-primary/60')
    expect(hotRule.className).not.toContain('border-primary/70')
  })

  it('the flow arrows render between the three columns', async () => {
    renderPage()
    await screen.findByTestId('topo-driver-plc1')
    // Two decorative arrow markers (south→engine, engine→north).
    expect(document.querySelectorAll('[aria-hidden="true"] .lucide-arrow-right').length).toBe(2)
  })
})

describe('TopologyPage — every row navigates (C-E6)', () => {
  it('driver rows link to the driver detail page', async () => {
    renderPage()
    const row = await screen.findByTestId('topo-driver-plc1')
    expect(row.getAttribute('href')).toBe('/corec/i1/admin/drivers/plc1')
  })

  it('transport rows link to the transport detail page', async () => {
    renderPage()
    const row = await screen.findByTestId('topo-transport-mqtt-out')
    expect(row.getAttribute('href')).toBe('/corec/i1/admin/transports/mqtt-out')
  })

  it('rule chips link to the rules page', async () => {
    renderPage()
    const chip = await screen.findByTestId('topo-rule-hot-rule')
    expect(chip.getAttribute('href')).toBe('/corec/i1/admin/rules')
  })
})

describe('TopologyPage — loading is not "empty" (C-E5)', () => {
  it('a pending drivers query shows a loading state, never the no-drivers alarm', async () => {
    const { getDrivers } = await import('@/api/endpoints')
    vi.mocked(getDrivers).mockReturnValueOnce(new Promise(() => {}) as never)

    renderPage()

    // Transports settled and render; the southbound column is still
    // loading and must NOT claim "no southbound drivers attached".
    expect(await screen.findByTestId('topo-transport-mqtt-out')).toBeTruthy()
    expect(screen.queryByText('No southbound drivers attached')).toBeNull()
    expect(screen.getByAltText('CoreC')).toBeTruthy()
  })

  it('a pending transports query shows a loading state, never the no-transports alarm', async () => {
    const { getTransports } = await import('@/api/endpoints')
    vi.mocked(getTransports).mockReturnValueOnce(new Promise(() => {}) as never)

    renderPage()

    expect(await screen.findByTestId('topo-driver-plc1')).toBeTruthy()
    expect(screen.queryByText('No northbound transports attached')).toBeNull()
    expect(screen.getByAltText('CoreC')).toBeTruthy()
  })
})

describe('TopologyPage — the error banner names what failed (C-E7)', () => {
  it('lists the failed queries instead of a generic error', async () => {
    const { getRules, getStats } = await import('@/api/endpoints')
    vi.mocked(getRules).mockReturnValueOnce(Promise.reject(new Error('boom')) as never)
    vi.mocked(getStats).mockReturnValueOnce(Promise.reject(new Error('boom')) as never)

    renderPage()

    // Both failures are named, joined for the active locale — no more
    // anonymous "Error" banner that hid WHICH query died.
    expect(await screen.findByText('Failed to load: runtime stats and rules')).toBeTruthy()
  })
})
