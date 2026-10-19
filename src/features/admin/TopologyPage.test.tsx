// @vitest-environment jsdom
// Topology-page behavior tests (C-E6 row links; C-E4/C-E5/C-E7 cases join
// in their own commits).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
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
