import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveConnection } from '@/api/activeConnection'
import { resetProxyMode, setProxyMode } from '@/api/proxyMode'
import { CoreCWebSocket, type WSStatus } from '@/api/websocket'

/**
 * TD-TEST-004 — CoreCWebSocket behavior.
 *
 * Covers: sliding-window rate limiting (>500 msg/s drops), exponential backoff
 * with ±20% jitter, maxRetries=10 → 'rejected', upgrade-rejection detection
 * (1006/1008/1011 when never opened), destroy() nulling handlers + clearing the
 * pending reconnect, and secret-disappears stopping reconnect.
 *
 * The source drives the browser WebSocket via `new WebSocket(url)` plus the
 * `onopen/onmessage/onerror/onclose` properties and `close()` — it does not use
 * `addEventListener`. We replace `globalThis.WebSocket` with a class-based mock
 * that records every instance and exposes helpers to dispatch events
 * synchronously. Fake timers drive the backoff/retry scheduling; Math.random is
 * pinned so jitter is deterministic.
 */

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static last(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]
  }
  static reset(): void {
    MockWebSocket.instances = []
  }

  // Ready-state constants — part of the real WebSocket interface
  // (CoreCWebSocket.reconnect() compares against WebSocket.OPEN/CONNECTING).
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  readyState = 0
  bufferedAmount = 0
  closed = false
  readonly sent: unknown[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  close(): void {
    this.closed = true
    this.readyState = 3
  }
  send(data: unknown): void {
    this.sent.push(data)
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true
  }

  /** Simulate the server completing the WS handshake. */
  simulateOpen(): void {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
  /** Simulate an inbound frame; `data` is the raw payload (usually JSON text). */
  simulateMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent)
  }
  simulateError(): void {
    this.onerror?.(new Event('error'))
  }
  /** Simulate a close frame with the given WebSocket close code. */
  simulateClose(code: number, reason = ''): void {
    this.readyState = 3
    this.onclose?.({ code, reason, wasClean: code === 1000 } as CloseEvent)
  }
}

const OriginalWebSocket = globalThis.WebSocket
let mathRandomSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  MockWebSocket.reset()
  vi.useFakeTimers()
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
  // Pin jitter factor to 1.0 (0.8 + 0.5 * 0.4) so backoff delays are exact.
  mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
  resetProxyMode()
  setActiveConnection({
    instanceId: 'test-instance',
    baseUrl: 'http://127.0.0.1:9090',
    secret: 'test-secret-token',
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  globalThis.WebSocket = OriginalWebSocket
  setActiveConnection(null)
})

describe('CoreCWebSocket — TD-TEST-004', () => {
  describe('sliding-window rate limiting', () => {
    it('delivers up to maxMsgPerSec (500) per second and drops the rest', () => {
      const onMessage = vi.fn()
      const client = new CoreCWebSocket('/tags/stream', {}, onMessage)
      const inst = MockWebSocket.last()
      inst.simulateOpen()

      // 600 messages arrive within the same 1-second window (fake clock frozen).
      // The first 500 are delivered; the remaining 100 are dropped, not queued.
      for (let i = 0; i < 600; i++) {
        inst.simulateMessage(JSON.stringify({ i }))
      }

      expect(onMessage).toHaveBeenCalledTimes(500)
      expect(onMessage.mock.calls[0][0]).toEqual({ i: 0 })
      expect(onMessage.mock.calls[499][0]).toEqual({ i: 499 })

      client.destroy()
    })

    it('prunes the window after 1 second so messages flow again', () => {
      const onMessage = vi.fn()
      const client = new CoreCWebSocket('/tags/stream', {}, onMessage)
      const inst = MockWebSocket.last()
      inst.simulateOpen()

      for (let i = 0; i < 500; i++) inst.simulateMessage(JSON.stringify({ i }))
      expect(onMessage).toHaveBeenCalledTimes(500)

      // Same window → dropped.
      inst.simulateMessage(JSON.stringify({ dropped: true }))
      expect(onMessage).toHaveBeenCalledTimes(500)

      // >1s later the ring prunes and a fresh message is delivered.
      vi.advanceTimersByTime(1001)
      inst.simulateMessage(JSON.stringify({ after: 'reset' }))
      expect(onMessage).toHaveBeenCalledTimes(501)
      expect(onMessage.mock.calls[500][0]).toEqual({ after: 'reset' })

      client.destroy()
    })
  })

  describe('exponential backoff', () => {
    it('grows ~1.5× per retry (jitter pinned to factor 1.0)', () => {
      const client = new CoreCWebSocket('/test', {}, vi.fn())
      let inst = MockWebSocket.last()

      // baseDelay=1000, factor=1.5 → delays 1000, 1500, 2250 with jitter 1.0.
      const expected = [1000, 1500, 2250]
      for (let i = 0; i < expected.length; i++) {
        inst.simulateClose(1000) // close → scheduleReconnect at retry i
        const countBefore = MockWebSocket.instances.length

        // Just before the delay elapses: no reconnect yet.
        vi.advanceTimersByTime(expected[i] - 1)
        expect(MockWebSocket.instances.length).toBe(countBefore)

        // At exactly the delay: the reconnect fires and opens a new socket.
        vi.advanceTimersByTime(1)
        expect(MockWebSocket.instances.length).toBe(countBefore + 1)
        inst = MockWebSocket.last()
      }

      // The sequence is a 1.5× geometric progression.
      expect(expected[1] / expected[0]).toBe(1.5)
      expect(expected[2] / expected[1]).toBe(1.5)

      client.destroy()
    })

    it('applies ±20% jitter (factor 0.8–1.2) on top of the base delay', () => {
      // retry 0 base delay = 1000 → jitter = 1000 * (0.8 + random * 0.4).
      // random=0 → 800; random=1 → 1200.

      // Lower bound: factor 0.8 → 800 ms.
      mathRandomSpy.mockReturnValue(0)
      let client = new CoreCWebSocket('/test', {}, vi.fn())
      let inst = MockWebSocket.last()
      inst.simulateClose(1000)
      let countBefore = MockWebSocket.instances.length
      vi.advanceTimersByTime(799)
      expect(MockWebSocket.instances.length).toBe(countBefore)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances.length).toBe(countBefore + 1)
      client.destroy()

      // Upper bound: factor 1.2 → 1200 ms.
      mathRandomSpy.mockReturnValue(1)
      client = new CoreCWebSocket('/test', {}, vi.fn())
      inst = MockWebSocket.last()
      inst.simulateClose(1000)
      countBefore = MockWebSocket.instances.length
      vi.advanceTimersByTime(1199)
      expect(MockWebSocket.instances.length).toBe(countBefore)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances.length).toBe(countBefore + 1)
      client.destroy()
    })

    it('caps the delay at maxDelay (30000 ms) before maxRetries rejects', () => {
      const client = new CoreCWebSocket('/test', {}, vi.fn())
      let inst = MockWebSocket.last()

      // Drive 9 reconnects so retryCount reaches 9. At retry 9 the raw delay
      // 1000 * 1.5^9 ≈ 38444 exceeds maxDelay (30000) and is capped — this is
      // the last retry before maxRetries (10) rejects on the next close.
      for (let i = 0; i < 9; i++) {
        inst.simulateClose(1000)
        vi.advanceTimersByTime(100000)
        inst = MockWebSocket.last()
      }

      // The 10th reconnect is scheduled at exactly the cap (jitter 1.0 → 30000).
      inst.simulateClose(1000)
      const countBefore = MockWebSocket.instances.length
      vi.advanceTimersByTime(29999)
      expect(MockWebSocket.instances.length).toBe(countBefore)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances.length).toBe(countBefore + 1)

      client.destroy()
    })
  })

  describe('maxRetries', () => {
    it('transitions to "rejected" after 10 consecutive failures', () => {
      const statuses: WSStatus[] = []
      const client = new CoreCWebSocket('/test', {}, vi.fn(), (s) => statuses.push(s))
      let inst = MockWebSocket.last()

      // 10 reconnects: each close schedules a reconnect that fires on advance.
      for (let i = 0; i < 10; i++) {
        inst.simulateClose(1000)
        vi.advanceTimersByTime(100000)
        inst = MockWebSocket.last()
      }

      // retryCount is now 10 → the next close rejects instead of reconnecting.
      const instancesBefore = MockWebSocket.instances.length
      inst.simulateClose(1000)

      expect(statuses.at(-1)).toBe('rejected')
      expect(statuses.filter((s) => s === 'rejected')).toHaveLength(1)
      expect(MockWebSocket.instances.length).toBe(instancesBefore)
      expect(vi.getTimerCount()).toBe(0)

      client.destroy()
    })
  })

  describe('upgrade-rejection detection', () => {
    it('emits "rejected" on a 1008 close before the socket ever opened', () => {
      const statuses: WSStatus[] = []
      const client = new CoreCWebSocket('/test', {}, vi.fn(), (s) => statuses.push(s))
      const inst = MockWebSocket.last()

      inst.simulateClose(1008) // never opened + policy code → rejected

      expect(statuses).toContain('rejected')
      // The close still schedules a reconnect (reject is surfaced, not terminal).
      expect(vi.getTimerCount()).toBe(1)
      client.destroy()
    })

    it('does not emit "rejected" on 1008 if the socket previously opened', () => {
      const statuses: WSStatus[] = []
      const client = new CoreCWebSocket('/test', {}, vi.fn(), (s) => statuses.push(s))
      const inst = MockWebSocket.last()

      inst.simulateOpen() // everOpened = true
      inst.simulateClose(1008)

      expect(statuses).not.toContain('rejected')
      client.destroy()
    })
  })

  describe('reconnect() — controlled manual retry after rejected (B01)', () => {
    it('is a no-op when a socket is already open', () => {
      const client = new CoreCWebSocket('/test', {}, vi.fn())
      const inst = MockWebSocket.last()
      inst.simulateOpen()
      const countBefore = MockWebSocket.instances.length

      client.reconnect()

      // No new socket — the live one is left untouched.
      expect(MockWebSocket.instances.length).toBe(countBefore)
      expect(client).toBeTruthy()
      client.destroy()
    })

    it('immediately opens a fresh attempt after maxRetries rejected, resetting the backoff ladder', () => {
      const statuses: WSStatus[] = []
      const client = new CoreCWebSocket('/test', {}, vi.fn(), (s) => statuses.push(s))
      let inst = MockWebSocket.last()

      // Burn the full ladder → rejected (no pending timer, no self-healing).
      for (let i = 0; i < 10; i++) {
        inst.simulateClose(1000)
        vi.advanceTimersByTime(100000)
        inst = MockWebSocket.last()
      }
      inst.simulateClose(1000)
      expect(statuses.at(-1)).toBe('rejected')
      expect(vi.getTimerCount()).toBe(0)

      // Manual retry: a new socket is created synchronously and reports
      // 'connecting' — the rejected state has an in-band recovery entry.
      const instancesBefore = MockWebSocket.instances.length
      client.reconnect()
      expect(MockWebSocket.instances.length).toBe(instancesBefore + 1)
      expect(statuses.at(-1)).toBe('connecting')

      // Backoff discipline: the fresh ladder starts at baseDelay again
      // (1000 ms), not wherever the exhausted counter left off.
      inst = MockWebSocket.last()
      inst.simulateClose(1000)
      const countBefore = MockWebSocket.instances.length
      vi.advanceTimersByTime(999)
      expect(MockWebSocket.instances.length).toBe(countBefore)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances.length).toBe(countBefore + 1)

      client.destroy()
    })

    it('cancels a pending automatic retry and connects immediately', () => {
      const client = new CoreCWebSocket('/test', {}, vi.fn())
      const inst = MockWebSocket.last()
      inst.simulateClose(1000) // schedules reconnect in ~1000ms
      expect(vi.getTimerCount()).toBe(1)

      client.reconnect() // operator asked to retry NOW
      expect(vi.getTimerCount()).toBe(0) // pending timer cleared
      expect(MockWebSocket.instances.length).toBe(2) // fresh immediate attempt

      client.destroy()
    })

    it('is a no-op after destroy()', () => {
      const client = new CoreCWebSocket('/test', {}, vi.fn())
      client.destroy()
      const instancesBefore = MockWebSocket.instances.length

      client.reconnect()

      expect(MockWebSocket.instances.length).toBe(instancesBefore)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('detaches the dead socket handlers so queued events cannot fire into the new cycle', () => {
      const onMessage = vi.fn()
      const client = new CoreCWebSocket('/test', {}, onMessage)
      const dead = MockWebSocket.last()
      dead.simulateClose(1000) // dead (readyState 3), never opened

      client.reconnect() // replaces this.ws with a fresh socket

      // The old socket's handlers were nulled — a late frame is a no-op.
      dead.simulateMessage(JSON.stringify({ stale: true }))
      expect(onMessage).not.toHaveBeenCalled()

      client.destroy()
    })
  })

  describe('onDrop — rate-limit visibility (B01)', () => {
    it('reports dropped frames to the onDrop callback instead of dropping silently', () => {
      const onMessage = vi.fn()
      const onDrop = vi.fn()
      const client = new CoreCWebSocket('/tags/stream', {}, onMessage, undefined, onDrop)
      const inst = MockWebSocket.last()
      inst.simulateOpen()

      // 502 messages in the same 1s window: 500 delivered, 2 dropped.
      for (let i = 0; i < 502; i++) inst.simulateMessage(JSON.stringify({ i }))
      expect(onMessage).toHaveBeenCalledTimes(500)
      // First drop reports immediately.
      expect(onDrop).toHaveBeenCalledTimes(1)
      expect(onDrop).toHaveBeenLastCalledWith(1)

      // Further drops in the same window are throttled (≥1s between reports)…
      for (let i = 0; i < 10; i++) inst.simulateMessage(JSON.stringify({ i }))
      expect(onDrop).toHaveBeenCalledTimes(1)

      // …and the next window reports the accumulated count: after 1s the
      // ring prunes, 500 fresh messages refill the window, and the next
      // frame drops — the report carries the 11 accumulated drops + this
      // one (the first drop of the previous window was already reported).
      vi.advanceTimersByTime(1001)
      for (let i = 0; i < 500; i++) inst.simulateMessage(JSON.stringify({ refill: i }))
      expect(onMessage).toHaveBeenCalledTimes(1000)
      inst.simulateMessage(JSON.stringify({ after: 'window' }))
      expect(onDrop).toHaveBeenCalledTimes(2)
      expect(onDrop).toHaveBeenLastCalledWith(12)

      client.destroy()
    })

    it('never calls onDrop while messages stay under the cap', () => {
      const onDrop = vi.fn()
      new CoreCWebSocket('/tags/stream', {}, vi.fn(), undefined, onDrop)
      const inst = MockWebSocket.last()
      inst.simulateOpen()

      for (let i = 0; i < 100; i++) inst.simulateMessage(JSON.stringify({ i }))
      expect(onDrop).not.toHaveBeenCalled()
    })
  })

  describe('destroy()', () => {
    it('nulls all handlers so queued events cannot fire after destroy', () => {
      const onMessage = vi.fn()
      const statuses: WSStatus[] = []
      const client = new CoreCWebSocket('/test', {}, onMessage, (s) => statuses.push(s))
      const inst = MockWebSocket.last()
      inst.simulateOpen()
      const statusesBefore = statuses.length

      client.destroy()

      // Handlers are nulled — events become no-ops.
      inst.simulateMessage(JSON.stringify({ x: 1 }))
      inst.simulateClose(1000)
      inst.simulateError()

      expect(onMessage).not.toHaveBeenCalled()
      expect(statuses.length).toBe(statusesBefore)
      expect(inst.onopen).toBeNull()
      expect(inst.onmessage).toBeNull()
      expect(inst.onerror).toBeNull()
      expect(inst.onclose).toBeNull()
      expect(inst.closed).toBe(true)
    })

    it('clears the pending reconnect so no queued reconnect fires', () => {
      const client = new CoreCWebSocket('/test', {}, vi.fn())
      const inst = MockWebSocket.last()
      inst.simulateClose(1000) // schedules a reconnect
      expect(vi.getTimerCount()).toBe(1)

      const instancesBefore = MockWebSocket.instances.length
      client.destroy()
      expect(vi.getTimerCount()).toBe(0) // clearTimeout

      vi.advanceTimersByTime(100000)
      expect(MockWebSocket.instances.length).toBe(instancesBefore) // no reconnect
    })
  })

  describe('secret disappearing', () => {
    it('stops reconnecting and emits "rejected" when the secret is gone', () => {
      const statuses: WSStatus[] = []
      const client = new CoreCWebSocket('/test', {}, vi.fn(), (s) => statuses.push(s))
      const inst = MockWebSocket.last()

      // The user leaves the instance route → active connection loses its secret.
      setActiveConnection({
        instanceId: 'test-instance',
        baseUrl: 'http://127.0.0.1:9090',
        secret: '',
      })

      const instancesBefore = MockWebSocket.instances.length
      inst.simulateClose(1000) // scheduleReconnect sees no secret → rejected

      expect(statuses.at(-1)).toBe('rejected')
      expect(MockWebSocket.instances.length).toBe(instancesBefore)
      expect(vi.getTimerCount()).toBe(0)
      client.destroy()
    })
  })

  describe('direct mode (static-host fallback)', () => {
    it('connects directly to the backend WS URL without /corec-ws proxy', () => {
      setProxyMode('direct')
      const client = new CoreCWebSocket('/tags/stream', {}, vi.fn())
      const inst = MockWebSocket.last()

      // URL should be ws://127.0.0.1:9090/tags/stream?token=... (direct)
      expect(inst.url).toContain('ws://127.0.0.1:9090/tags/stream')
      expect(inst.url).not.toContain('/corec-ws')
      expect(inst.url).toContain('token=test-secret-token')
      client.destroy()
    })

    it('passes extra params in direct mode', () => {
      setProxyMode('direct')
      const client = new CoreCWebSocket('/ws', { tag: 'temp1' }, vi.fn())
      const inst = MockWebSocket.last()

      expect(inst.url).toContain('ws://127.0.0.1:9090/ws')
      expect(inst.url).toContain('tag=temp1')
      expect(inst.url).toContain('token=test-secret-token')
      client.destroy()
    })
  })
})
