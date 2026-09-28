// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { RulesPage } from './RulesPage'
import { TransportsPage } from './TransportsPage'

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
  getHealthReady: vi.fn().mockResolvedValue({ ready: true }),
  getStats: vi.fn().mockResolvedValue({}),
  getDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  getDeadLetters: vi.fn().mockResolvedValue({ dead_letters: [] }),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
  getConfigsRaw: vi.fn().mockResolvedValue('node:\n  id: test\n'),
  validateConfigs: vi.fn().mockResolvedValue({ valid: true }),
}))

// Mock connectionStore as connected (selector-aware, like real Zustand).
const _connState = {
  baseUrl: 'http://test',
  secret: 'test-secret',
  isConnected: true,
  isConnecting: false,
  serverVersion: 'dev',
  serverName: 'test',
  lastError: null,
  setConnection: vi.fn(),
  setConnected: vi.fn(),
  setError: vi.fn(),
  clearAuth: vi.fn(),
  disconnect: vi.fn(),
  revalidate: vi.fn().mockResolvedValue(undefined),
}
vi.mock('@/stores/connectionStore', () => ({
  useConnectionStore: Object.assign(
    vi.fn((selector?: (s: typeof _connState) => unknown) =>
      selector ? selector(_connState) : _connState,
    ),
    { getState: () => _connState },
  ),
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

describe('render smoke (#185 regression)', () => {
  it('TransportsPage renders without infinite loop', () => {
    let container: ReturnType<typeof render> | undefined
    act(() => {
      container = render(wrap(<TransportsPage />))
    })
    expect(container?.container).toBeTruthy()
  })

  it('RulesPage renders without infinite loop', () => {
    let container: ReturnType<typeof render> | undefined
    act(() => {
      container = render(wrap(<RulesPage />))
    })
    expect(container?.container).toBeTruthy()
  })
})
