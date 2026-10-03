// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RulesPage } from '@/features/admin/RulesPage'
import { TransportsPage } from '@/features/admin/TransportsPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

// Mock only the API layer (no real network). Stores are REAL — the test
// validates that useConfigStore selectors don't create new references on
// every getSnapshot call (the #185 "Maximum update depth exceeded" bug).
vi.mock('@/api/endpoints', () => ({
  getTransports: vi.fn().mockResolvedValue({
    transports: [
      {
        name: 'webhook-in',
        type: 'http',
        state: 2,
        published: 0,
        failed: 0,
        received: 0,
        last_publish: '0001-01-01T00:00:00Z',
        queue_size: 0,
        dropped_commands: 0,
      },
    ],
  }),
  getRules: vi.fn().mockResolvedValue({
    rules: [
      {
        index: 0,
        name: 'forward-all',
        match: 'data_point.name == "*"',
        action: 'forward',
        target: 'webhook-in',
        priority: 100,
        disabled: false,
        matched: 0,
        fired: 0,
      },
    ],
  }),
  getConfigs: vi.fn().mockResolvedValue({ redacted: true }),
  getServerInfo: vi.fn().mockResolvedValue({ name: 'test', version: 'dev' }),
  getStats: vi.fn().mockResolvedValue({}),
  getDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  getDeadLetters: vi.fn().mockResolvedValue({ dead_letters: [] }),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
  getConfigsRaw: vi.fn().mockResolvedValue('node:\n  id: test\n'),
  validateConfigs: vi.fn().mockResolvedValue({ valid: true }),
}))

// Mock the active connection module so apiRequest has credentials.
vi.mock('@/api/activeConnection', () => ({
  getActiveConnection: () => ({
    instanceId: 'test-instance',
    baseUrl: 'http://test',
    secret: 'test-secret',
  }),
  setActiveConnection: vi.fn(),
}))

// Mock the ConnectionContext so useConnection() returns a connected state.
const _connCtx = {
  instance: {
    id: 'test-instance',
    name: 'Test Instance',
    baseUrl: 'http://test',
    secret: 'test-secret',
    createdAt: new Date().toISOString(),
    sortOrder: 1,
  },
  isConnected: true,
  isConnecting: false,
  error: null,
  serverInfo: { name: 'test', version: 'dev' },
  reconnect: vi.fn(),
}
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => _connCtx,
  ConnectionProvider: ({ children }: { children: React.ReactNode }) => children,
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

// Force English so content assertions are readable and deterministic,
// independent of the localStorage-backed default locale (zh-CN).
// Mark the connection as connected via the REAL connection store (kept real to
// preserve the #185 selector-stability regression check) so useConnectedQuery
// enables the mocked transports/rules queries instead of staying idle.
beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

// vitest runs without globals:true, so @testing-library/react's auto-cleanup
// never registers — clean up explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('render smoke (#185 regression)', () => {
  it('TransportsPage renders without infinite loop', async () => {
    let container: ReturnType<typeof render> | undefined
    act(() => {
      container = render(wrap(<TransportsPage />))
    })
    expect(container?.container).toBeTruthy()
    // Static page chrome renders synchronously — an empty <div> would fail here.
    expect(screen.getByText('Northbound Transports')).toBeTruthy()
    expect(screen.getByText('Runtime Status')).toBeTruthy()
    expect(screen.getByText('Create Transport')).toBeTruthy()
    // Transport rows appear after the mocked useTransports query resolves.
    expect(await screen.findByText('webhook-in')).toBeTruthy()
  })

  it('RulesPage renders without infinite loop', async () => {
    let container: ReturnType<typeof render> | undefined
    act(() => {
      container = render(wrap(<RulesPage />))
    })
    expect(container?.container).toBeTruthy()
    // Static page chrome renders synchronously — an empty <div> would fail here.
    expect(screen.getByText('Rule Pipeline & Routing')).toBeTruthy()
    expect(screen.getByText('Runtime Rules')).toBeTruthy()
    expect(screen.getByText('Create Rule')).toBeTruthy()
    // Rule rows appear after the mocked useRules query resolves.
    expect(await screen.findByText('forward-all')).toBeTruthy()
  })
})
