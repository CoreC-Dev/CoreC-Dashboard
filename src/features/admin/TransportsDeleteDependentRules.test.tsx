// @vitest-environment jsdom
// C-A13 regression: the transport delete scan must warn about rules that
// reference the transport as a target — including rules that exist only in
// the working config (created, not yet applied). The scan used to read the
// saved config only, so a freshly-created pending rule silently became a
// dangling target at apply time.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransportsPage } from '@/features/admin/TransportsPage'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'
import type { CoreCConfig } from '@/types/config'

vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => ({
  getTransports: vi.fn().mockResolvedValue({ transports: [] }),
  // Saved config: the transport exists, but NOT the pending rule — the
  // rule below lives only in the working config.
  getConfigsRaw: vi
    .fn()
    .mockResolvedValue(
      [
        'transports:',
        '  - name: mqtt-out',
        '    type: mqtt',
        '    settings:',
        '      broker: tcp://broker:1883',
        '',
      ].join('\n'),
    ),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
}))

const MQTT_OUT = { name: 'mqtt-out', type: 'mqtt', settings: { broker: 'tcp://broker:1883' } }

const SAVED: CoreCConfig = { transports: [MQTT_OUT] }
const WORKING: CoreCConfig = {
  transports: [MQTT_OUT],
  rules: [
    // Pending rule: created in the working config, not yet applied — the
    // delete scan must warn about it too (working ∪ saved, C-A13).
    { name: 'pending-fwd', match: 'ALL', action: 'forward', priority: 100, target: 'mqtt-out' },
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

describe('TransportsPage delete confirmation — dependent rules (C-A13)', () => {
  it('lists pending working-config rules that reference the transport', async () => {
    render(wrap(<TransportsPage />))

    // The config-section card for mqtt-out is rendered; open its delete dialog.
    await screen.findByText('mqtt-out')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })

    // The pending (unapplied) rule is listed with the audit copy.
    expect(await screen.findByText('1 rule(s) reference this transport:')).toBeTruthy()
    expect(screen.getByText('pending-fwd → forward')).toBeTruthy()
    expect(screen.getByText(/dangling target after deletion/)).toBeTruthy()

    // Confirming removes the transport from the working config (still
    // delayed-apply: no PUT happens here).
    const { updateConfigs } = await import('@/api/endpoints')
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    })
    expect(useConfigStore.getState().workingConfig?.transports).toHaveLength(0)
    expect(vi.mocked(updateConfigs)).not.toHaveBeenCalled()
  })

  it('shows the plain confirmation when nothing references the transport', async () => {
    useConfigStore.setState({
      workingConfig: { transports: [MQTT_OUT] },
      savedConfig: { transports: [MQTT_OUT] },
      dirty: false,
    })
    render(wrap(<TransportsPage />))

    await screen.findByText('mqtt-out')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })

    expect(
      await screen.findByText(/Are you sure you want to delete transport "mqtt-out"/),
    ).toBeTruthy()
    expect(screen.queryByText(/reference this transport/)).toBeNull()
  })
})
