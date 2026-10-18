// @vitest-environment jsdom
// C-A7 regression: the config and runtime zones render the same driver
// twice with no way to tell them apart. Config cards now carry
// live/configured-only + pending-changes badges (the live badge jumps to
// the runtime card), runtime cards carry a pending-changes badge that
// jumps back to the config card.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriversPage } from '@/features/admin/DriversPage'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'
import type { CoreCConfig, DriverConfig } from '@/types/config'

vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => ({
  getDrivers: vi.fn().mockResolvedValue({
    drivers: [
      {
        name: 'plc-live',
        type: 'modbus-tcp',
        state: 2,
        tag_count: 1,
        read_count: 10,
        error_count: 0,
        reconnect_count: 0,
        last_read: '2024-01-01T00:00:00Z',
        last_error: '',
      },
      {
        name: 'plc-gone',
        type: 'modbus-tcp',
        state: 2,
        tag_count: 1,
        read_count: 10,
        error_count: 0,
        reconnect_count: 0,
        last_read: '2024-01-01T00:00:00Z',
        last_error: '',
      },
    ],
  }),
  getConfigsRaw: vi.fn().mockResolvedValue('drivers: []\n'),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
}))

const LIVE: DriverConfig = {
  name: 'plc-live',
  type: 'modbus-tcp',
  settings: { host: '10.0.0.1', port: 502 },
  tags: [{ name: 't', address: '40001', type: 'float32' }],
}
const LIVE_EDITED: DriverConfig = {
  ...LIVE,
  settings: { host: '10.0.0.9', port: 502 },
}
const GONE_FROM_WORKING: DriverConfig = {
  name: 'plc-gone',
  type: 'modbus-tcp',
  settings: { host: '10.0.0.2' },
  tags: [{ name: 'g', address: '40002', type: 'float32' }],
}

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

const setConfigs = (working: CoreCConfig, saved: CoreCConfig) => {
  useConfigStore.setState({
    workingConfig: working,
    savedConfig: saved,
    dirty: true,
    seedStatus: 'ready',
    seedError: null,
  })
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
  // jsdom has no scrollIntoView; stub it to observe the cross-zone jumps.
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  setConfigs({ drivers: [LIVE, GONE_FROM_WORKING] }, { drivers: [LIVE, GONE_FROM_WORKING] })
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
  vi.clearAllMocks()
})

describe('dual-zone badges and cross-links (C-A7)', () => {
  it('clean state: config card says Live with no pending badge', async () => {
    render(wrap(<DriversPage />))
    // The config card renders from the store synchronously; the Live badge
    // depends on the runtime query — wait for it.
    // Both drivers are in the runtime list — both config cards say Live
    // once the runtime query resolves.
    await waitFor(() => expect(screen.getAllByText('Live').length).toBe(2))
    expect(screen.queryByText('Pending changes')).toBeNull()
    expect(screen.queryByText('Configured, not running')).toBeNull()
  })

  it('an edited working config marks both zones pending and the badges cross-jump', async () => {
    setConfigs(
      { drivers: [LIVE_EDITED, GONE_FROM_WORKING] },
      { drivers: [LIVE, GONE_FROM_WORKING] },
    )
    render(wrap(<DriversPage />))
    await screen.findByText('plc-live')

    // Both zones show the pending badge for plc-live (config + runtime).
    await waitFor(async () => expect(screen.getAllByText('Pending changes').length).toBe(2))

    // The runtime badge jumps back to the config card…
    const configCard = document.getElementById('cfg-driver-plc-live')
    expect(configCard).toBeTruthy()
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Jump to the configuration card — plc-live/ }),
      )
    })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

    // …and the config card's Live badge jumps to the runtime card.
    const runtimeCard = document.getElementById('runtime-driver-plc-live')
    expect(runtimeCard).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Jump to the runtime card — plc-live/ }))
    })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('a driver removed from the working config keeps its runtime card flagged pending', async () => {
    setConfigs({ drivers: [LIVE] }, { drivers: [LIVE, GONE_FROM_WORKING] })
    render(wrap(<DriversPage />))
    await screen.findByText('plc-gone')

    // plc-gone has no config card anymore (pending delete), but its
    // runtime card is flagged so the operator sees the removal is not
    // yet applied.
    await waitFor(() => expect(screen.getAllByText('Pending changes').length).toBe(1))
    expect(screen.getAllByText('plc-live').length).toBeGreaterThan(0) // sanity: page intact
  })

  it('a config-only driver (not in the runtime list) shows Configured, not running', async () => {
    setConfigs(
      { drivers: [LIVE, { name: 'plc-draft', type: 's7', settings: {}, tags: [] }] },
      { drivers: [LIVE, { name: 'plc-draft', type: 's7', settings: {}, tags: [] }] },
    )
    render(wrap(<DriversPage />))
    await screen.findByText('plc-draft')

    // Before the runtime list resolves every card reads as configured;
    // after, only plc-draft (plc-live is live) — wait for the settled
    // count.
    await waitFor(() => expect(screen.getAllByText('Configured, not running').length).toBe(1))
  })
})
