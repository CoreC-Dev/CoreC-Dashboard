// @vitest-environment jsdom
// Regression: deleting a driver must warn about the rules that lose
// their data source — including rules that exist only in the working
// config (not yet applied) — mirroring the TransportsPage template.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  getDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  getConfigsRaw: vi.fn().mockResolvedValue('drivers: []\n'),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
}))

const PLC1: DriverConfig = {
  name: 'plc1',
  type: 'modbus-tcp',
  settings: { host: '10.0.0.1' },
  tags: [{ name: 'temperature', address: '40001', type: 'float32' }],
}

// A valid transport so the live config validation stays quiet — the
// page-wide ValidationBanner also renders rule names when targets dangle,
// which would pollute the text assertions below.
const MQTT_OUT = { name: 'mqtt-out', type: 'mqtt', settings: { broker: 'tcp://broker:1883' } }

const SAVED: CoreCConfig = {
  drivers: [PLC1],
  transports: [MQTT_OUT],
  rules: [
    { name: 'alert-hot', match: 'driver == "plc1" && value > 80', action: 'alert', priority: 10 },
    { name: 'fwd-all', match: 'ALL', action: 'forward', priority: 100, target: 'mqtt-out' },
  ],
}
const WORKING: CoreCConfig = {
  drivers: [PLC1],
  transports: [MQTT_OUT],
  rules: [
    ...SAVED.rules!,
    // Pending rule: created in the working config, not yet applied — the
    // scan must warn about it too (working ∪ saved).
    { name: 'pending-rule', match: 'driver contains "plc"', action: 'drop', priority: 20 },
  ],
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

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  useConfigStore.setState({
    workingConfig: WORKING,
    savedConfig: SAVED,
    dirty: true,
    seedStatus: 'ready',
    seedError: null,
  })
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

describe('DriversPage delete confirmation — dependent rules', () => {
  it('lists rules that lose their data source, including pending ones', async () => {
    render(wrap(<DriversPage />))

    // The config-section card for plc1 is rendered; open its delete dialog.
    const card = await screen.findByText('plc1')
    expect(card).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })

    // Both the saved rule and the pending working-config rule are listed
    // with the audit copy; the ALL rule is not.
    expect(await screen.findByText('2 rule(s) will lose their data source:')).toBeTruthy()
    expect(screen.getByText('alert-hot → alert')).toBeTruthy()
    expect(screen.getByText('pending-rule → drop')).toBeTruthy()
    expect(screen.queryByText(/fwd-all/)).toBeNull()
    expect(screen.getByText(/stop receiving this driver's data/)).toBeTruthy()

    // Confirming removes the driver from the working config (still
    // delayed-apply: no PUT happens here).
    const { updateConfigs } = await import('@/api/endpoints')
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    })
    expect(useConfigStore.getState().workingConfig?.drivers).toHaveLength(0)
    expect(vi.mocked(updateConfigs)).not.toHaveBeenCalled()
  })

  it('shows the plain confirmation when nothing depends on the driver', async () => {
    useConfigStore.setState({
      workingConfig: { drivers: [PLC1] },
      savedConfig: { drivers: [PLC1] },
      dirty: false,
    })
    render(wrap(<DriversPage />))

    await screen.findByText('plc1')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })

    expect(await screen.findByText(/Are you sure you want to delete driver "plc1"/)).toBeTruthy()
    expect(screen.queryByText(/lose their data source/)).toBeNull()
  })
})
