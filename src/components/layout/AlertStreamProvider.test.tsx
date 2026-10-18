// @vitest-environment jsdom
// AlertStreamProvider — the instance-level /logs subscription (audit B02).
// The WebSocket class is mocked with a controllable stub; the REAL provider
// is under test: exactly one /logs socket on mount, events → alertStore
// (bounded feed + unread badge count), per-pref sound/notification on error
// events, status wiring into wsStatusStore, and full cleanup on unmount.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertStreamProvider } from '@/components/layout/AlertStreamProvider'
import i18n from '@/i18n'
import { useAlertStore } from '@/stores/alertStore'
import { useWsStatusStore } from '@/stores/wsStatusStore'
import type { LogEvent } from '@/types/models'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type WsMessageHandler = (data: LogEvent) => void
type WsStatusHandler = (status: string) => void
type WsDropHandler = (dropped: number) => void

interface MockSocket {
  path: string
  onMessage: WsMessageHandler
  onStatus: WsStatusHandler
  onDrop: WsDropHandler
  reconnect: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const sockets: MockSocket[] = []

vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    path: string
    onMessage: WsMessageHandler
    onStatus: WsStatusHandler
    onDrop: WsDropHandler
    reconnect = vi.fn()
    destroy = vi.fn()
    constructor(
      path: string,
      _params: Record<string, string>,
      onMessage: WsMessageHandler,
      onStatus?: WsStatusHandler,
      onDrop?: WsDropHandler,
    ) {
      this.path = path
      this.onMessage = onMessage
      this.onStatus = onStatus ?? (() => {})
      this.onDrop = onDrop ?? (() => {})
      sockets.push(this)
    }
  },
}))

const beep = vi.fn()
vi.mock('@/lib/alertAudio', () => ({
  playAlertBeep: (...args: unknown[]) => beep(...args),
  primeAlertAudio: vi.fn(),
}))

const alertState = () => useAlertStore.getState()

const evt = (level: number, payload: string): LogEvent => ({
  level,
  type: level >= 8 ? 'ERROR' : 'WARN',
  payload,
  timestamp: '2026-01-01T00:00:00Z',
})

function renderProvider(route = '/corec/inst-1/monitor/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AlertStreamProvider />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sockets.length = 0
  beep.mockClear()
  useAlertStore.setState({
    events: [],
    unreadErrorCount: 0,
    deadLetterCount: 0,
    viewing: false,
    soundEnabled: false,
    notificationsEnabled: false,
  })
  useWsStatusStore.getState().reset()
})

afterEach(() => {
  cleanup()
  sockets.length = 0
})

describe('AlertStreamProvider — mount/unmount lifecycle', () => {
  it('opens exactly one /logs socket on mount (the only alert subscription in the app)', () => {
    renderProvider()
    expect(sockets).toHaveLength(1)
    expect(sockets[0].path).toBe('/logs')
  })

  it('destroys the socket and detaches from the status store on unmount', () => {
    const { unmount } = renderProvider()
    expect(Object.keys(useWsStatusStore.getState().streams)).toHaveLength(1)

    unmount()
    expect(sockets[0].destroy).toHaveBeenCalledTimes(1)
    expect(Object.keys(useWsStatusStore.getState().streams)).toHaveLength(0)
  })

  it('registers its stream status so the connection banner covers /logs too', () => {
    renderProvider()
    act(() => sockets[0].onStatus('rejected'))
    const entry = Object.values(useWsStatusStore.getState().streams)[0]
    expect(entry?.status).toBe('rejected')
  })

  it('wires a reconnect handle for the banner rejected-retry button', () => {
    const { unmount } = renderProvider()
    act(() => sockets[0].onStatus('rejected'))
    act(() => useWsStatusStore.getState().retryRejectedStreams())
    expect(sockets[0].reconnect).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('AlertStreamProvider — event flow into alertStore', () => {
  it('buffers level>=4 events into the store feed (rAF batch) and drops info/debug', async () => {
    renderProvider()

    act(() => {
      sockets[0].onMessage(evt(0, 'info'))
      sockets[0].onMessage(evt(-4, 'debug'))
      sockets[0].onMessage(evt(4, 'warn-1'))
      sockets[0].onMessage(evt(8, 'error-1'))
    })

    await waitFor(() => expect(alertState().events).toHaveLength(2))
    expect(alertState().events.map((e) => e.payload)).toEqual(['warn-1', 'error-1'])
  })

  it('increments the unread badge count for error events while the alerts page is closed', async () => {
    renderProvider()
    act(() => {
      sockets[0].onMessage(evt(8, 'boom'))
      sockets[0].onMessage(evt(8, 'bang'))
      sockets[0].onMessage(evt(4, 'meh'))
    })
    await waitFor(() => expect(alertState().unreadErrorCount).toBe(2))
  })

  it('does not increment unread while the alerts page is viewing', async () => {
    useAlertStore.setState({ viewing: true })
    renderProvider()
    act(() => sockets[0].onMessage(evt(8, 'boom')))
    await waitFor(() => expect(alertState().events).toHaveLength(1))
    expect(alertState().unreadErrorCount).toBe(0)
  })

  it('plays the beep and shows a browser notification per error event when enabled', async () => {
    const constructed: { title: string; body?: string }[] = []
    // Class-like stub: `new Notification(title, { body })` is observable,
    // and permission is pre-granted so the provider's guard passes.
    const NotificationStub = class {
      constructor(title: string, options: { body?: string }) {
        constructed.push({ title, body: options?.body })
      }
      static permission = 'granted' as const
      static requestPermission = vi.fn()
    }
    vi.stubGlobal('Notification', NotificationStub as unknown as typeof Notification)

    try {
      useAlertStore.setState({ soundEnabled: true, notificationsEnabled: true })
      renderProvider()
      act(() => {
        sockets[0].onMessage(evt(8, 'boom'))
        sockets[0].onMessage(evt(4, 'just-a-warning'))
      })

      await waitFor(() => expect(alertState().events).toHaveLength(2))
      expect(beep).toHaveBeenCalledTimes(1) // error only, not the warning
      expect(constructed).toHaveLength(1)
      expect(constructed[0]).toEqual({
        title: 'CoreC Alert',
        body: 'New error-level event detected',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('stays silent when both preferences are off', async () => {
    renderProvider()
    act(() => sockets[0].onMessage(evt(8, 'boom')))
    await waitFor(() => expect(alertState().events).toHaveLength(1))
    expect(beep).not.toHaveBeenCalled()
  })
})

describe('AlertStreamProvider — instance hygiene', () => {
  it('clears transient alert data and resubscribes when the instance id changes in place', async () => {
    // A MemoryRouter does NOT rebuild its history on rerender, so an
    // in-place instance switch is simulated the real way: navigate the
    // SAME router via a Link. The provider stays mounted (same route
    // element) while :id flips — its [id]-keyed effects must react.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/corec/inst-1/monitor/dashboard']}>
          <Link to="/corec/inst-2/monitor/dashboard">switch</Link>
          <Routes>
            <Route path="/corec/:id/monitor/dashboard" element={<AlertStreamProvider />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(sockets).toHaveLength(1)

    useAlertStore.setState({ unreadErrorCount: 5, deadLetterCount: 3 })

    fireEvent.click(screen.getByText('switch'))

    // The previous instance's counts must not leak into the new one.
    await waitFor(() => expect(alertState().unreadErrorCount).toBe(0))
    expect(alertState().deadLetterCount).toBe(0)
    // The socket was recreated for the new instance id.
    expect(sockets).toHaveLength(2)
    expect(sockets[0].destroy).toHaveBeenCalledTimes(1)
  })
})
