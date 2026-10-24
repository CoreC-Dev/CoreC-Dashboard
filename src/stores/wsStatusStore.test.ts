import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deriveAggregate,
  deriveBanner,
  deriveRateLimited,
  makeStreamId,
  useWsStatusStore,
  type WsStreamState,
} from '@/stores/wsStatusStore'

/**
 * wsStatusStore — the aggregation behind the AppShell "实时流" badge and the
 * monitor pages' connection banner. These tests pin the
 * state machine: registration, status transitions (including the
 * first-connect vs reconnect distinction via downOnce), the throttled
 * activity ping, drop reports, rejected-retry fan-out, and the snapshot
 * stability of the derived selectors (useSyncExternalStore requires equal
 * references for equal input).
 */

const reg = (id: string) => useWsStatusStore.getState().registerStream(id)
const store = () => useWsStatusStore.getState()

beforeEach(() => {
  useWsStatusStore.getState().reset()
})

describe('registerStream / unregisterStream', () => {
  it('registers a new stream as connecting (initial handshake) and deriveAggregate reflects it', () => {
    reg('a')
    expect(store().streams.a?.status).toBe('connecting')
    expect(store().streams.a?.downOnce).toBe(false)
    expect(deriveAggregate(store().streams)).toBe('connecting')
  })

  it('derives idle when no stream is registered', () => {
    expect(deriveAggregate(store().streams)).toBe('idle')
  })

  it('unregisterStream removes the entry and its reconnect handle', () => {
    const handle = vi.fn()
    const sink = reg('a')
    store().attachReconnect('a', handle)
    sink('rejected')

    // While registered and rejected, retry fires the handle.
    useWsStatusStore.getState().retryRejectedStreams()
    expect(handle).toHaveBeenCalledTimes(1)

    // After detach the stream is gone — its handle must not survive.
    useWsStatusStore.getState().unregisterStream('a')
    useWsStatusStore.getState().retryRejectedStreams()
    expect(handle).toHaveBeenCalledTimes(1)
    expect('a' in store().streams).toBe(false)
    expect(deriveAggregate(store().streams)).toBe('idle')
  })

  it('ignores status reports from a detached stream (late socket events)', () => {
    const sink = reg('a')
    useWsStatusStore.getState().unregisterStream('a')
    sink('open')
    expect('a' in store().streams).toBe(false)
  })

  it('makeStreamId yields unique ids per call', () => {
    expect(makeStreamId('tags')).not.toBe(makeStreamId('tags'))
  })
})

describe('status transitions', () => {
  it('open → aggregate open, banner hidden', () => {
    const sink = reg('a')
    sink('open')
    expect(deriveAggregate(store().streams)).toBe('open')
    expect(deriveBanner(store().streams)).toBeNull()
  })

  it('closed after open → down (data stale), and connecting mid-reconnect stays down', () => {
    const sink = reg('a')
    sink('open')
    sink('closed')
    expect(deriveAggregate(store().streams)).toBe('down')
    // Retries flip status to 'connecting' but downOnce keeps the banner up —
    // the data is still stale while the retry is in flight.
    sink('connecting')
    expect(deriveAggregate(store().streams)).toBe('down')
  })

  it('first-time connecting (never opened) is NOT down — no scary banner on page load', () => {
    const sink = reg('a')
    sink('connecting')
    expect(deriveAggregate(store().streams)).toBe('connecting')
    expect(deriveBanner(store().streams)).toBeNull()
  })

  it('first connection failure marks downOnce → banner shows even before ever opening', () => {
    const sink = reg('a')
    sink('error') // server down at page load: REST seed is stale, socket retrying
    expect(deriveAggregate(store().streams)).toBe('down')
    expect(deriveBanner(store().streams)?.kind).toBe('down')
  })

  it('recovery (open) clears downOnce and hides the banner', () => {
    const sink = reg('a')
    sink('open')
    sink('closed')
    expect(deriveBanner(store().streams)?.kind).toBe('down')
    sink('open')
    expect(store().streams.a?.downOnce).toBe(false)
    expect(deriveBanner(store().streams)).toBeNull()
  })

  it('rejected wins over down in the aggregate', () => {
    const sinkA = reg('a')
    const sinkB = reg('b')
    sinkA('open')
    sinkA('closed')
    sinkB('rejected')
    expect(deriveAggregate(store().streams)).toBe('rejected')
    expect(deriveBanner(store().streams)?.kind).toBe('rejected')
  })

  it('a healthy stream keeps the aggregate down while another is down (partial outage visible)', () => {
    const sinkA = reg('a')
    const sinkB = reg('b')
    sinkA('open')
    sinkB('open')
    sinkB('closed')
    expect(deriveAggregate(store().streams)).toBe('down')
  })
})

describe('touchStream — throttled activity ping', () => {
  it('updates lastActivityAt at most once per second', () => {
    vi.useFakeTimers()
    try {
      const start = Date.now()
      reg('a')
      const before = store().streams.a?.lastActivityAt
      expect(before).toBe(start)

      // Same second → throttled.
      vi.advanceTimersByTime(500)
      useWsStatusStore.getState().touchStream('a')
      expect(store().streams.a?.lastActivityAt).toBe(start)

      // Next second → recorded.
      vi.advanceTimersByTime(600)
      useWsStatusStore.getState().touchStream('a')
      expect(store().streams.a?.lastActivityAt).toBe(start + 1100)
    } finally {
      vi.useRealTimers()
    }
  })

  it('is a no-op for an unregistered stream', () => {
    expect(() => useWsStatusStore.getState().touchStream('ghost')).not.toThrow()
    expect('ghost' in store().streams).toBe(false)
  })

  it('open refreshes lastActivityAt (resume-of-flow timestamp)', () => {
    vi.useFakeTimers()
    try {
      const start = Date.now()
      const sink = reg('a')
      vi.advanceTimersByTime(5000)
      sink('open')
      expect(store().streams.a?.lastActivityAt).toBe(start + 5000)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('reportDropped — rate-limit hint window', () => {
  it('deriveRateLimited stays true within the 3s window and clears on the next recompute after it lapses', () => {
    // In the app, recomputes are driven by store writes (activity touches
    // keep arriving while delivered frames flow under the cap), so the
    // contract is: the hint clears when the window has lapsed AND the
    // streams object changes again.
    vi.useFakeTimers()
    try {
      reg('a')
      expect(deriveRateLimited(store().streams)).toBe(false)

      useWsStatusStore.getState().reportDropped('a', 12)
      expect(deriveRateLimited(store().streams)).toBe(true)

      vi.advanceTimersByTime(2999)
      useWsStatusStore.getState().touchStream('a') // still-delivered frame → store write
      expect(deriveRateLimited(store().streams)).toBe(true)

      // Advance past BOTH the 3s hint window and the 1s touch throttle.
      vi.advanceTimersByTime(1001)
      useWsStatusStore.getState().touchStream('a') // window lapsed → hint clears
      expect(deriveRateLimited(store().streams)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a status transition clears a stale drop hint (drops require a live socket)', () => {
    const sink = reg('a')
    useWsStatusStore.getState().reportDropped('a', 12)
    expect(deriveRateLimited(store().streams)).toBe(true)

    sink('closed')
    expect(store().streams.a?.recentDropped).toBe(0)
    expect(deriveRateLimited(store().streams)).toBe(false)
  })
})

describe('retryRejectedStreams — the rejected recovery entry point', () => {
  it('calls the reconnect handle of rejected streams only', () => {
    const rejectedHandle = vi.fn()
    const downHandle = vi.fn()
    const healthyHandle = vi.fn()

    const sinkRejected = reg('rejected-stream')
    store().attachReconnect('rejected-stream', rejectedHandle)
    const sinkDown = reg('down-stream')
    store().attachReconnect('down-stream', downHandle)
    const sinkHealthy = reg('healthy-stream')
    store().attachReconnect('healthy-stream', healthyHandle)

    sinkHealthy('open')
    sinkDown('open')
    sinkDown('closed')
    sinkRejected('rejected')

    useWsStatusStore.getState().retryRejectedStreams()

    expect(rejectedHandle).toHaveBeenCalledTimes(1)
    expect(downHandle).not.toHaveBeenCalled()
    expect(healthyHandle).not.toHaveBeenCalled()
  })

  it('is a no-op with no rejected streams', () => {
    expect(() => useWsStatusStore.getState().retryRejectedStreams()).not.toThrow()
  })
})

describe('derived selector snapshot stability', () => {
  it('deriveBanner returns the SAME object for the SAME streams reference', () => {
    const sink = reg('a')
    sink('closed')
    const streams = store().streams
    expect(deriveBanner(streams)).toBe(deriveBanner(streams))
  })

  it('deriveBanner returns null (stable) while healthy', () => {
    const sink = reg('a')
    sink('open')
    const streams = store().streams
    expect(deriveBanner(streams)).toBeNull()
    expect(deriveBanner(streams)).toBeNull()
  })

  it('deriveBanner reports the freshest lastActivityAt across streams', () => {
    vi.useFakeTimers()
    try {
      const t0 = Date.now()
      const sinkA = reg('a') // lastActivity = t0
      vi.advanceTimersByTime(5000)
      const sinkB = reg('b') // lastActivity = t0+5000
      sinkB('open') // b.lastActivity = t0+5000
      sinkA('closed') // a goes down with its stale t0 timestamp
      sinkB('closed') // b goes down too — freshest data wins the {{time}} slot
      const banner = deriveBanner(store().streams)
      expect(banner?.kind).toBe('down')
      expect(banner?.lastActivityAt).toBe(t0 + 5000)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('reset', () => {
  it('clears all entries and handles', () => {
    const handle = vi.fn()
    const sink = reg('a')
    sink('rejected')
    store().attachReconnect('a', handle)

    useWsStatusStore.getState().reset()

    expect(Object.keys(store().streams)).toHaveLength(0)
    useWsStatusStore.getState().retryRejectedStreams()
    expect(handle).not.toHaveBeenCalled()
  })
})

describe('WsStreamState shape', () => {
  it('exposes the full per-stream record for badge/banner derivation', () => {
    reg('shape')
    const entry: WsStreamState | undefined = store().streams.shape
    expect(entry).toBeDefined()
    expect(entry).toMatchObject({
      status: 'connecting',
      downOnce: false,
      recentDropped: 0,
      lastDropAt: 0,
    })
    expect(typeof entry?.lastActivityAt).toBe('number')
  })
})
