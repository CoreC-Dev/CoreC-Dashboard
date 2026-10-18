// @vitest-environment jsdom
// AlertsPage — after B02 the page renders the GLOBAL alert feed and owns no
// /logs subscription. These tests pin the migration invariants: the page
// mounts ZERO WebSockets (the instance-level provider owns the only one),
// renders the shared store's events, honors filters, and writes the sound /
// notification preference toggles through the store's legacy-persisted keys.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertsPage } from '@/features/monitor/AlertsPage'
import i18n from '@/i18n'
import { useAlertStore } from '@/stores/alertStore'
import type { LogEvent } from '@/types/models'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The WebSocket class must never be instantiated by the page — recording
// instances makes the "no duplicate subscription" assertion possible.
const socketInstances: unknown[] = []
vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    constructor() {
      socketInstances.push(this)
    }
    destroy = vi.fn()
  },
}))

vi.mock('@/api/endpoints', () => ({
  getDeadLetters: vi.fn().mockResolvedValue({ failed_writes: [] }),
  getRules: vi.fn().mockResolvedValue({ rules: [] }),
}))

const evt = (level: number, payload: string): LogEvent => ({
  level,
  type: level >= 8 ? 'ERROR' : 'WARN',
  payload,
  timestamp: '2026-01-01T12:00:00Z',
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AlertsPage />
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  localStorage.clear()
  socketInstances.length = 0
  useAlertStore.setState({
    events: [],
    unreadErrorCount: 2,
    deadLetterCount: 0,
    viewing: false,
    soundEnabled: false,
    notificationsEnabled: false,
  })
})

afterEach(() => {
  cleanup()
})

describe('AlertsPage — subscription dedupe (B02)', () => {
  it('opens NO /logs socket of its own — the global provider owns the only one', () => {
    renderPage()
    expect(socketInstances).toHaveLength(0)
  })

  it('marks the unread backlog as seen while mounted, and stops counting new errors', () => {
    const { unmount } = renderPage()
    expect(useAlertStore.getState().viewing).toBe(true)
    expect(useAlertStore.getState().unreadErrorCount).toBe(0)

    // An error event flushed by the global provider while the page is open
    // feeds the page but must NOT re-arm the sidebar badge.
    act(() => useAlertStore.getState().pushEvents([evt(8, 'while-viewing')]))
    expect(useAlertStore.getState().unreadErrorCount).toBe(0)
    expect(useAlertStore.getState().events[0]?.payload).toBe('while-viewing')

    unmount()
    expect(useAlertStore.getState().viewing).toBe(false)
  })
})

describe('AlertsPage — shared feed rendering', () => {
  it('renders the store-provided warn/error events', () => {
    useAlertStore.setState({
      events: [evt(8, 'driver plc-03 connection reset'), evt(4, 'queue backpressure')],
    })
    renderPage()

    expect(screen.getByText(/driver plc-03 connection reset/)).toBeTruthy()
    expect(screen.getByText(/queue backpressure/)).toBeTruthy()
  })

  it('narrows the visible rows with the free-text filter on top of the shared feed', async () => {
    useAlertStore.setState({
      events: [evt(8, 'fatal write failure'), evt(4, 'queue backpressure')],
    })
    renderPage()

    expect(screen.getByText(/fatal write failure/)).toBeTruthy()
    expect(screen.getByText(/queue backpressure/)).toBeTruthy()

    const input = screen.getByPlaceholderText('Filter by content…')
    fireEvent.change(input, { target: { value: 'fatal' } })
    await waitFor(() => {
      expect(screen.queryByText(/queue backpressure/)).toBeNull()
    })
    expect(screen.getByText(/fatal write failure/)).toBeTruthy()
  })
})

describe('AlertsPage — preference toggles (kept here, honored globally)', () => {
  it('sound toggle flips the shared preference and persists the legacy key', () => {
    renderPage()
    const button = screen.getByRole('button', { name: 'Sound Off' })

    fireEvent.click(button)
    expect(useAlertStore.getState().soundEnabled).toBe(true)
    expect(localStorage.getItem('corec_alert_sound')).toBe('1')
    expect(screen.getByRole('button', { name: 'Sound On' })).toBeTruthy()
  })

  it('notification toggle flips the shared preference and persists the legacy key', () => {
    renderPage()
    const button = screen.getByRole('button', { name: 'Notifications Off' })

    fireEvent.click(button)
    // The store action is async (permission request); the pref flip is sync.
    expect(useAlertStore.getState().notificationsEnabled).toBe(true)
    expect(localStorage.getItem('corec_alert_notification')).toBe('1')
    expect(screen.getByRole('button', { name: 'Notifications On' })).toBeTruthy()
  })
})

describe('AlertsPage — notification permission honesty (B09)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the blocked state, not "on", when the browser has denied notifications', () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn(),
    } as unknown as typeof Notification)
    useAlertStore.setState({ notificationsEnabled: true })

    renderPage()

    // Audit copy (en): the toggle must admit the channel is dead instead
    // of a comforting "Notifications On" that never delivers.
    const button = screen.getByRole('button', {
      name: /Notifications blocked by the browser/,
    })
    expect(button.getAttribute('aria-pressed')).toBe('true') // pref still on
    expect(button.getAttribute('title')).toBe(
      'Notifications blocked by the browser — allow them in site settings, then re-enable',
    )
    expect(screen.queryByRole('button', { name: 'Notifications On' })).toBeNull()
  })

  it('still shows the plain on state when permission is granted', () => {
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn(),
    } as unknown as typeof Notification)
    useAlertStore.setState({ notificationsEnabled: true })

    renderPage()

    expect(screen.getByRole('button', { name: 'Notifications On' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /blocked by the browser/ })).toBeNull()
  })
})
