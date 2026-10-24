// @vitest-environment jsdom
// ConnectionGate: the probe-failure screen inside the
// instance routes.
//  - the visible verdict is the context's TRANSLATED kind (the context
//    classifies probe failures and resolves pack keys); raw technical detail
//    (the probed endpoint) is demoted to a collapsed fold, not the headline.
//  - the screen must not be a dead end — retry, "edit this instance"
//    (homepage edit dialog via ?edit=<id>), and "back to instances" are all
//    reachable; the headline names the instance.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ConnectionGate } from '@/components/layout/ConnectionGate'
import i18n from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The gate only consumes the context value — mock it per scenario.
type MockInstance = {
  id: string
  name: string
  baseUrl: string
  secret: string
  createdAt: string
  sortOrder: number
}
type MockConnection = {
  instance: MockInstance | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  serverInfo: unknown
  reconnect: () => void
}
const mockConnection = vi.hoisted(
  () =>
    ({
      instance: {
        id: 'inst_a',
        name: 'Alpha',
        baseUrl: 'http://alpha.local',
        secret: 's',
        createdAt: '',
        sortOrder: 1,
      },
      isConnected: false,
      isConnecting: false,
      error: 'Connection timed out',
      serverInfo: null,
      reconnect: vi.fn(),
    }) as MockConnection,
)

vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => mockConnection,
}))

// Renders the current location (path + search) so link navigation is
// assertable without depending on HashRouter href formats.
const LocationProbe: React.FC = () => {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderGateAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/corec/:id/monitor/dashboard"
          element={
            <ConnectionGate>
              <span>APP</span>
            </ConnectionGate>
          }
        />
        <Route path="/" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const INSTANCE = {
  id: 'inst_a',
  name: 'Alpha',
  baseUrl: 'http://alpha.local',
  secret: 's',
  createdAt: '',
  sortOrder: 1,
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockConnection.instance = INSTANCE
  mockConnection.isConnecting = false
  mockConnection.isConnected = false
  mockConnection.error = 'Connection timed out'
})

describe('ConnectionGate loading state', () => {
  it('renders the loading fallback while connecting', () => {
    mockConnection.isConnecting = true
    renderGateAt('/corec/inst-1/monitor/dashboard')
    expect(screen.getByRole('status', { name: 'Loading...' })).toBeTruthy()
    expect(screen.queryByText('APP')).toBeNull()
  })
})

describe('ConnectionGate failure screen', () => {
  it('names the instance in the headline and keeps the verdict as subline', () => {
    renderGateAt('/corec/inst-1/monitor/dashboard')

    expect(screen.getByRole('heading', { name: 'Could not connect to Alpha' })).toBeTruthy()
    expect(screen.getByText('Connection timed out')).toBeTruthy()
  })

  it('folds the technical detail away from the headline', () => {
    renderGateAt('/corec/inst-1/monitor/dashboard')

    // The fold is collapsed by default: the endpoint is reachable in the DOM
    // (jsdom applies no CSS) but the <details> is not open, and the summary
    // — not the endpoint — is what sits under the headline.
    const summary = screen.getByText('Technical details')
    const details = summary.closest('details')!
    expect(details.open).toBe(false)
    expect(details.textContent).toContain('GET http://alpha.local/stats')

    fireEvent.click(summary)
    expect(details.open).toBe(true)
  })

  it('retries via the context reconnect', () => {
    renderGateAt('/corec/inst-1/monitor/dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mockConnection.reconnect).toHaveBeenCalled()
  })

  it('links back to the instance list (dead-end fix)', () => {
    renderGateAt('/corec/inst-1/monitor/dashboard')
    fireEvent.click(screen.getByRole('link', { name: 'Back to instances' }))
    expect(screen.getByTestId('location').textContent).toBe('/')
  })

  it('links to the homepage edit dialog for this instance', () => {
    renderGateAt('/corec/inst-1/monitor/dashboard')
    fireEvent.click(screen.getByRole('link', { name: 'Edit instance' }))
    expect(screen.getByTestId('location').textContent).toBe('/?edit=inst_a')
  })

  it('renders the localized missing-instance verdict without name/edit escapes', () => {
    mockConnection.instance = null
    mockConnection.error = 'Instance not found — go back and pick one from the homepage'
    renderGateAt('/corec/inst-1/monitor/dashboard')

    expect(
      screen.getByRole('heading', {
        name: 'Instance not found — go back and pick one from the homepage',
      }),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Edit instance' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to instances' })).toBeTruthy()
  })
})

describe('ConnectionGate connected state', () => {
  it('renders children once connected', () => {
    mockConnection.isConnected = true
    mockConnection.error = null
    renderGateAt('/corec/inst-1/monitor/dashboard')
    expect(screen.getByText('APP')).toBeTruthy()
  })
})
