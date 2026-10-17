// @vitest-environment jsdom
// Component test for the Diagnostics page's live /traffic + /memory panel.
// The WebSocket class is mocked with a controllable stub so the test pushes
// frames by hand; the REAL useCoreCWebSocket hook wiring (create on mount,
// destroy on unmount, ref-stable callbacks) is what's under test, plus the
// client-side rate differencing and the zod frame boundary.
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RealtimeStreamsPanel } from '@/components/admin/RealtimeStreamsPanel'
import i18n from '@/i18n'

type WsMessageHandler = (data: unknown) => void
type WsStatusHandler = (status: string) => void

interface MockSocket {
  path: string
  onMessage: WsMessageHandler
  onStatus: WsStatusHandler
  destroy: ReturnType<typeof vi.fn>
}

const sockets: MockSocket[] = []

vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    path: string
    onMessage: WsMessageHandler
    onStatus: WsStatusHandler
    destroy = vi.fn()
    constructor(
      path: string,
      _params: Record<string, string>,
      onMessage: WsMessageHandler,
      onStatus?: WsStatusHandler,
    ) {
      this.path = path
      this.onMessage = onMessage
      this.onStatus = onStatus ?? (() => {})
      sockets.push(this)
    }
  },
}))

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  sockets.length = 0
})

describe('RealtimeStreamsPanel', () => {
  it('subscribes to both streams with a 1s interval', () => {
    render(<RealtimeStreamsPanel />)

    expect(sockets.map((s) => s.path)).toEqual(['/traffic', '/memory'])
  })

  it('diffs cumulative traffic counters into per-second rates', async () => {
    render(<RealtimeStreamsPanel />)
    const traffic = sockets[0]

    // First frame only establishes the baseline — the panel keeps waiting.
    act(() => traffic.onMessage({ read: 100, publish: 50, dropped: 1 }))
    // Both columns wait until their own first delta / first frame arrives.
    expect(screen.getAllByText('Waiting for first frames…').length).toBe(2)

    // Second frame: 1s cadence ⇒ delta == per-second rate.
    act(() => traffic.onMessage({ read: 110, publish: 55, dropped: 1 }))
    expect(screen.getByText('10')).toBeTruthy() // reads/s
    expect(screen.getByText('5')).toBeTruthy() // publishes/s
    expect(screen.getByText('0')).toBeTruthy() // dropped/s
  })

  it('treats a counter reset (server restart) as the whole current value', () => {
    render(<RealtimeStreamsPanel />)
    const traffic = sockets[0]

    act(() => traffic.onMessage({ read: 100, publish: 50, dropped: 1 }))
    act(() => traffic.onMessage({ read: 110, publish: 55, dropped: 1 }))
    // Restart: counters drop below the previous frame.
    act(() => traffic.onMessage({ read: 2, publish: 71, dropped: 9 }))

    expect(screen.getByText('2')).toBeTruthy() // reads/s = current value
    expect(screen.getByText('16')).toBeTruthy() // publishes/s
    expect(screen.getByText('8')).toBeTruthy() // dropped/s
  })

  it('drops a malformed traffic frame instead of rendering it (zod boundary)', () => {
    render(<RealtimeStreamsPanel />)
    const traffic = sockets[0]

    act(() => traffic.onMessage({ read: 100, publish: 50, dropped: 1 }))
    act(() => traffic.onMessage({ read: 110, publish: 55, dropped: 1 }))
    expect(screen.getByText('10')).toBeTruthy()

    // Contract drift: a frame without numeric counters must not corrupt the
    // last good rates.
    act(() => traffic.onMessage({ read: 'oops', publish: 55, dropped: 1 }))
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.queryByText('NaN')).toBeNull()
  })

  it('renders live memory values from /memory frames', () => {
    render(<RealtimeStreamsPanel />)
    const memory = sockets[1]

    act(() =>
      memory.onMessage({
        alloc: 1572864,
        total_alloc: 999999,
        sys: 2097152,
        num_gc: 3,
        goroutines: 42,
      }),
    )

    expect(screen.getByText('1.5 MB')).toBeTruthy() // heap alloc
    expect(screen.getByText('2.0 MB')).toBeTruthy() // sys
    expect(screen.getByText('42')).toBeTruthy() // goroutines
  })

  it('drops a malformed memory frame (zod boundary)', () => {
    render(<RealtimeStreamsPanel />)
    const memory = sockets[1]

    act(() =>
      memory.onMessage({ alloc: 1572864, total_alloc: 1, sys: 2097152, num_gc: 3, goroutines: 42 }),
    )
    expect(screen.getByText('42')).toBeTruthy()

    act(() => memory.onMessage({ alloc: 1572864, goroutines: 'many' }))
    // Keeps the last good frame's values.
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('destroys both sockets on unmount', () => {
    const { unmount } = render(<RealtimeStreamsPanel />)
    expect(sockets.length).toBe(2)

    unmount()

    for (const s of sockets) expect(s.destroy).toHaveBeenCalledTimes(1)
  })

  it('reflects the socket status in the badge', () => {
    render(<RealtimeStreamsPanel />)

    act(() => sockets[0].onStatus('open'))
    expect(screen.getByText('Connected to event logging bus...')).toBeTruthy()

    act(() => sockets[1].onStatus('error'))
    expect(screen.getByText('Connection error (check network / CoreC status)')).toBeTruthy()
  })
})
