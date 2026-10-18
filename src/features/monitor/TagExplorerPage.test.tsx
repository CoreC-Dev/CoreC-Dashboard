// @vitest-environment jsdom
// TagExplorerPage (B07/B11) — end-to-end page tests with the endpoint layer
// and the WebSocket class mocked; real react-query wiring inside a real
// QueryClient. B07: the stale-only toggle narrows the rendered set. The
// virtualized rows need layout jsdom doesn't provide, so assertions ride on
// the reactive result count and the table's empty states. i18n in English.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagExplorerPage } from '@/features/monitor/TagExplorerPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'
import type { DataPoint } from '@/types/models'

// The seeded count arrives via react-query → seed effect → deferred re-render;
// on cold transforms that chain can outlive the 1s default async timeout.
configure({ asyncUtilTimeout: 4000 })

// The page's useTagExplorerStream instantiates CoreCWebSocket — record
// constructor args so the URL-param test (B11) can assert the driver filter
// reached the socket, and stub the rest so no real socket opens.
const socketArgs: unknown[][] = []
vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    constructor(...args: unknown[]) {
      socketArgs.push(args)
    }
    destroy = vi.fn()
  },
}))

vi.mock('@/api/endpoints', () => ({
  getTags: vi.fn(),
  getDrivers: vi.fn(),
  writeTag: vi.fn(),
}))

import * as api from '@/api/endpoints'

// themeStore reads the system theme via matchMedia at module scope, which
// jsdom does not implement — stub it before any module import evaluates.
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

const point = (over: Partial<DataPoint>): DataPoint => ({
  driver: 'plc1',
  device: '',
  tag: 'seed',
  value: 1,
  type: 'int32',
  quality: 0,
  timestamp: '2026-01-01T12:00:00Z',
  ...over,
})

const SEED_TAGS = {
  pump: point({ tag: 'pump', driver: 'plc1', is_stale: true }),
  temp: point({ tag: 'temp', driver: 'plc2', quality: 1 }),
  level: point({ tag: 'level', driver: 'plc1', is_stale: true, quality: 2 }),
}

function renderPage(initialEntry = '/corec/inst1/monitor/tags') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/corec/:id/monitor/tags" element={<TagExplorerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
  socketArgs.length = 0
  useConnectionStore.getState().setConnected(true)
  vi.mocked(api.getTags).mockResolvedValue({ tags: { ...SEED_TAGS } })
  vi.mocked(api.getDrivers).mockResolvedValue({
    drivers: [
      {
        name: 'plc1',
        type: 'modbus',
        state: 2,
        last_read: '',
        last_error: '',
        tag_count: 2,
        read_count: 1,
        error_count: 0,
        reconnect_count: 0,
      },
      {
        name: 'plc2',
        type: 's7',
        state: 2,
        last_read: '',
        last_error: '',
        tag_count: 1,
        read_count: 1,
        error_count: 0,
        reconnect_count: 0,
      },
    ],
  })
})

afterEach(() => {
  cleanup()
})

describe('TagExplorerPage — problem-point filters (B07)', () => {
  it('seeds the REST snapshot and shows the total count', async () => {
    renderPage()

    expect(await screen.findByText('Total: 3 points')).toBeTruthy()
  })

  it('the stale-only toggle narrows the set to stale tags only', async () => {
    renderPage()
    expect(await screen.findByText('Total: 3 points')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Stale Tags Only' }))

    // pump + level are stale; temp is fresh.
    await screen.findByText('Total: 2 points')
    expect(screen.queryByText('Total: 3 points')).toBeNull()
  })

  it('combining stale-only with a search term can reach the empty state', async () => {
    renderPage()
    expect(await screen.findByText('Total: 3 points')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'temp' },
    })
    await screen.findByText('Total: 1 points')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Stale Tags Only' }))
    await screen.findByText('No points found matching current filter')
  })

  it('opens its /tags/stream socket exactly once for the unfiltered view', async () => {
    renderPage()
    expect(await screen.findByText('Total: 3 points')).toBeTruthy()

    expect(socketArgs).toHaveLength(1)
    expect(socketArgs[0]?.[0]).toBe('/tags/stream')
  })
})
