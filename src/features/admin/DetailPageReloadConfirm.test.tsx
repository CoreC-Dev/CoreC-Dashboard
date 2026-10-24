// @vitest-environment jsdom
// Regression: the driver/transport detail pages' quick-edit reload
// button must open the shared ConfigApplyConfirmationDialog (the SAME gate
// as the list pages) before any PUT /configs fires — zero requests before
// an explicit confirm, verbatim error kept in-dialog on failure.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriverDetailPage } from '@/features/admin/DriverDetailPage'
import { TransportDetailPage } from '@/features/admin/TransportDetailPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

// Detail/wizard pages render heavy card grids; under full-suite load on a
// 2-core box they can exceed the 5s default. 15s mirrors the
// BatchWritePanel suite-timeout precedent.
vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => ({
  getDriver: vi.fn().mockResolvedValue({
    name: 'plc1',
    type: 'modbus-tcp',
    state: 2,
    last_read: '0001-01-01T00:00:00Z',
    last_error: '',
    tag_count: 2,
    read_count: 10,
    error_count: 0,
    reconnect_count: 0,
  }),
  getDriverTags: vi.fn().mockResolvedValue({ tags: null }),
  getTransport: vi.fn().mockResolvedValue({
    name: 'mqtt-out',
    type: 'mqtt',
    state: 2,
    published: 5,
    failed: 0,
    received: 0,
    last_publish: '0001-01-01T00:00:00Z',
    queue_size: 0,
    dropped_commands: 0,
  }),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
  getConfigsRaw: vi
    .fn()
    .mockResolvedValue(
      [
        'drivers:',
        '  - name: plc1',
        '    type: modbus-tcp',
        '    settings:',
        '      host: 192.168.1.100',
        '      port: 502',
        'transports:',
        '  - name: mqtt-out',
        '    type: mqtt',
        '    settings:',
        '      broker: tcp://broker.local:1883',
        '      port: 1883',
      ].join('\n'),
    ),
}))

import * as api from '@/api/endpoints'

function renderAt(element: React.ReactElement, path: string, routePath: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('detail-page quick-edit reload confirmation gate', () => {
  it('driver detail: reload button opens the shared confirm dialog; PUT only fires after confirm', async () => {
    renderAt(<DriverDetailPage />, '/admin/drivers/plc1', '/admin/drivers/:name')

    // Page loaded with the mocked driver.
    expect((await screen.findAllByText('plc1')).length).toBeGreaterThan(0)

    // Expand the quick-edit card and change the host field.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle edit configuration section' }))
    })
    const hostInput = screen.getByLabelText('Host')
    expect(hostInput).toBeTruthy()
    await act(async () => {
      fireEvent.change(hostInput, { target: { value: '10.0.0.99' } })
    })

    // The button is now a preview gate, not a direct PUT.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview & hot-reload' }))
    })

    // The SHARED apply dialog opens — with the engine-suspend warning and
    // the YAML diff — and nothing has been sent yet.
    expect(await screen.findByText('Apply Configuration Changes')).toBeTruthy()
    expect(screen.getByText(/suspends the ENTIRE engine/)).toBeTruthy()
    expect(api.updateConfigs).not.toHaveBeenCalled()

    // Diff shows the edited value on the "after" side.
    expect(screen.getAllByText(/10\.0\.0\.99/).length).toBeGreaterThan(0)

    // Explicit confirm → exactly one PUT with the merged full config.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm & hot-reload' }))
    })

    await waitFor(() => expect(api.updateConfigs).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(api.updateConfigs).mock.calls[0][0].payload
    expect(payload).toContain('10.0.0.99')
    expect(payload).toContain('plc1')

    // Dialog closes on success; the card shows the success status.
    await waitFor(() => expect(screen.queryByText('Apply Configuration Changes')).toBeNull())
    expect(await screen.findByText('Config applied and hot-reloaded.')).toBeTruthy()
  })

  it('driver detail: a failed reload keeps the dialog open with the verbatim error', async () => {
    vi.mocked(api.updateConfigs).mockRejectedValueOnce(new Error('engine busy'))
    renderAt(<DriverDetailPage />, '/admin/drivers/plc1', '/admin/drivers/:name')

    expect((await screen.findAllByText('plc1')).length).toBeGreaterThan(0)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle edit configuration section' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview & hot-reload' }))
    })
    expect(await screen.findByText('Apply Configuration Changes')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm & hot-reload' }))
    })

    // The dialog stays open and surfaces the server error in place.
    expect(await screen.findByText(/Apply failed — the config was not reloaded:/)).toBeTruthy()
    expect(screen.getAllByText('engine busy').length).toBeGreaterThan(0)
    expect(screen.queryByText('Apply Configuration Changes')).toBeTruthy()

    await waitFor(() => expect(api.updateConfigs).toHaveBeenCalledTimes(1))
  })

  it('transport detail: reload goes through the same gate and cancel sends nothing', async () => {
    renderAt(<TransportDetailPage />, '/admin/transports/mqtt-out', '/admin/transports/:name')

    expect((await screen.findAllByText('mqtt-out')).length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle edit configuration section' }))
    })
    expect(screen.getByLabelText('Broker URL')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview & hot-reload' }))
    })

    expect(await screen.findByText('Apply Configuration Changes')).toBeTruthy()
    expect(screen.getByText(/suspends the ENTIRE engine/)).toBeTruthy()
    expect(api.updateConfigs).not.toHaveBeenCalled()

    // Cancel closes the dialog without any PUT.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    await waitFor(() => expect(screen.queryByText('Apply Configuration Changes')).toBeNull())
    expect(api.updateConfigs).not.toHaveBeenCalled()
  })
})
