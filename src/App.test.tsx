// @vitest-environment jsdom
// The AI assistant is mounted by the App layer inside ConnectionGate on
// both instance route trees (monitor/admin), exactly once per route; the
// homepage has no assistant entry point.
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no matchMedia; theme/sidebar hooks probe it in module scope.
vi.hoisted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
    const stub = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
    Object.defineProperty(window, 'matchMedia', {
      value: stub,
      writable: true,
      configurable: true,
    })
  }
})

// The shell chrome (nav, alert stream, palette) is covered by its own
// tests; here only the mount wiring matters.
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: () => <div data-testid="app-shell" />,
}))

// Skip the connection probe: the gate renders its children directly.
vi.mock('@/contexts/ConnectionContext', () => ({
  ConnectionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useConnection: () => ({
    instance: null,
    isConnected: true,
    isConnecting: false,
    error: null,
    serverInfo: null,
    reconnect: vi.fn(),
  }),
}))

// Page chunks are lazy; the route content is irrelevant to the mount test.
vi.mock('@/features/home/InstancePanel', () => ({ InstancePanel: () => null }))
vi.mock('@/features/monitor/DashboardPage', () => ({ DashboardPage: () => null }))
vi.mock('@/features/admin/DriversPage', () => ({ DriversPage: () => null }))

const RealRO = globalThis.ResizeObserver

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  class MockRO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockRO as unknown as typeof ResizeObserver
  useInstanceStore.setState({
    instances: [
      {
        id: 'inst_a',
        name: 'Alpha',
        baseUrl: 'http://a',
        secret: '',
        createdAt: '',
        sortOrder: 1,
      },
    ],
  })
})

afterEach(() => {
  cleanup()
  globalThis.ResizeObserver = RealRO
  useInstanceStore.setState({ instances: [] })
})

async function renderAt(hash: string) {
  window.location.hash = hash
  // Flush the lazy route chunks inside act so no suspended load leaks out.
  await act(async () => {
    render(<App />)
  })
}

describe('App assistant mount', () => {
  it('mounts exactly one assistant entry on the monitor route', async () => {
    await renderAt('#/corec/inst_a/monitor/dashboard')

    expect(screen.getByTestId('app-shell')).toBeTruthy()
    expect(screen.getAllByLabelText(i18n.t('assistant.open'))).toHaveLength(1)
  })

  it('mounts exactly one assistant entry on the admin route', async () => {
    await renderAt('#/corec/inst_a/admin/drivers')

    expect(screen.getByTestId('app-shell')).toBeTruthy()
    expect(screen.getAllByLabelText(i18n.t('assistant.open'))).toHaveLength(1)
  })

  it('has no assistant entry on the homepage', async () => {
    await renderAt('#/')

    expect(screen.queryByLabelText(i18n.t('assistant.open'))).toBeNull()
  })
})
