// @vitest-environment jsdom
// C-A6 regression: the page-header search covers BOTH zones — runtime
// cards filter by name/type/connection summary, and the bar itself only
// appears once the combined entity count passes the threshold.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriversPage } from '@/features/admin/DriversPage'
import { TransportsPage } from '@/features/admin/TransportsPage'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'

vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => ({
  getDrivers: vi.fn().mockResolvedValue({
    drivers: Array.from({ length: 8 }, (_, i) => ({
      name: i === 2 ? 'plc-line3' : `plc-0${i + 1}`,
      type: i === 5 ? 's7' : 'modbus-tcp',
      state: 2,
      tag_count: 3,
      read_count: 100,
      error_count: 0,
      reconnect_count: 0,
      last_read: '2024-01-01T00:00:00Z',
      last_error: '',
    })),
  }),
  getTransports: vi.fn().mockResolvedValue({
    transports: Array.from({ length: 8 }, (_, i) => ({
      name: i === 0 ? 'cloud-mqtt' : `http-0${i + 1}`,
      type: i === 0 ? 'mqtt' : 'http',
      state: 2,
      published: 1,
      failed: 0,
      received: 0,
      last_publish: '0001-01-01T00:00:00Z',
      queue_size: 0,
      dropped_commands: 0,
    })),
  }),
  // Runtime connection summaries come from the parsed raw config.
  getConfigsRaw: vi
    .fn()
    .mockResolvedValue(
      [
        'drivers:',
        '  - name: plc-line3',
        '    type: modbus-tcp',
        '    settings:',
        '      host: 10.30.0.9',
        '      port: 502',
        'transports:',
        '  - name: cloud-mqtt',
        '    type: mqtt',
        '    settings:',
        '      broker: tcp://broker.local:1883',
        'drivers2: []',
        '',
      ].join('\n'),
    ),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
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

const runtimeCard = (name: string) => screen.queryByText(name)

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  useConfigStore.setState({
    workingConfig: { drivers: [], transports: [] },
    savedConfig: { drivers: [], transports: [] },
    dirty: false,
    seedStatus: 'ready',
    seedError: null,
  })
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

describe('page-header search covers both zones (C-A6)', () => {
  it('DriversPage: filters runtime cards by name and shows the no-results state', async () => {
    render(wrap(<DriversPage />))

    // 8 runtime drivers → the header search bar is visible.
    const bar = await screen.findByPlaceholderText('Search...')
    expect(bar).toBeTruthy()
    await screen.findByText('plc-01')

    await act(async () => {
      fireEvent.change(bar, { target: { value: 'plc-line3' } })
    })

    expect(await screen.findByText('plc-line3')).toBeTruthy()
    expect(runtimeCard('plc-01')).toBeNull()
    expect(runtimeCard('plc-08')).toBeNull()

    // No match → an explicit no-results card, not a blank zone.
    await act(async () => {
      fireEvent.change(bar, { target: { value: 'zzz' } })
    })
    expect(await screen.findByText(/No results for "zzz"/)).toBeTruthy()
  })

  it('DriversPage: the runtime zone also matches the connection summary', async () => {
    render(wrap(<DriversPage />))
    const bar = await screen.findByPlaceholderText('Search...')

    // 10.30.0.9 is plc-line3's host — only in the connection summary.
    await act(async () => {
      fireEvent.change(bar, { target: { value: '10.30.0.9' } })
    })
    expect(await screen.findByText('plc-line3')).toBeTruthy()
    expect(runtimeCard('plc-01')).toBeNull()
  })

  it('DriversPage: the search bar stays hidden for small sites (≤ 6 entities)', async () => {
    const { getDrivers } = await import('@/api/endpoints')
    vi.mocked(getDrivers).mockResolvedValueOnce({
      drivers: [
        {
          name: 'plc-a',
          type: 'modbus-tcp',
          state: 2,
          tag_count: 1,
          read_count: 1,
          error_count: 0,
          reconnect_count: 0,
          last_read: '0001-01-01T00:00:00Z',
          last_error: '',
        },
        {
          name: 'plc-b',
          type: 'modbus-tcp',
          state: 2,
          tag_count: 1,
          read_count: 1,
          error_count: 0,
          reconnect_count: 0,
          last_read: '0001-01-01T00:00:00Z',
          last_error: '',
        },
      ],
    })
    render(wrap(<DriversPage />))

    await screen.findByText('plc-a')
    expect(screen.queryByPlaceholderText('Search...')).toBeNull()
  })

  it('TransportsPage: runtime transports filter through the header bar', async () => {
    render(wrap(<TransportsPage />))
    const bar = await screen.findByPlaceholderText('Search...')
    await screen.findByText('http-02')

    await act(async () => {
      fireEvent.change(bar, { target: { value: 'cloud-mqtt' } })
    })
    expect(await screen.findByText('cloud-mqtt')).toBeTruthy()
    expect(screen.queryByText('http-02')).toBeNull()
  })
})
