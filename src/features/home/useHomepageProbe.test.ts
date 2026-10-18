// @vitest-environment jsdom
import { act, cleanup, configure, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeOneInstance, useHomepageProbe } from '@/features/home/useHomepageProbe'
import { useInstanceStore } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

// Load-tolerant async-assertion timeout: the runner is shared with parallel
// agents on a 2-core host, and RTL waitFor's 1s default flakes under contention.
configure({ asyncUtilTimeout: 4000 })

// Mock fetch — each test configures the responses it expects.
const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

const INFO_URL = '/corec-proxy/'
const STATS_URL = '/corec-proxy/stats'
const TAGS_URL = '/corec-proxy/tags'
const RULES_URL = '/corec-proxy/rules'
const RAW_CFG_URL = '/corec-proxy/configs/raw'

function makeInstance(overrides: Partial<CoreCInstance> = {}): CoreCInstance {
  return {
    id: 'inst-1',
    name: 'Gateway A',
    baseUrl: 'http://127.0.0.1:9090',
    secret: 'secret-token',
    createdAt: '2026-01-01T00:00:00.000Z',
    sortOrder: 1,
    ...overrides,
  }
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Yield to the real event loop a few times so any abort-triggered rejection
 * can propagate through the probe's allSettled chain after unmount.
 */
async function flush(ticks = 5): Promise<void> {
  for (let i = 0; i < ticks; i++) await new Promise((r) => setTimeout(r, 0))
}

/** Drain microtasks only — used under fake timers where we must not advance
 * the 15s interval or 8s per-request timeout. */
async function flushMicrotasks(rounds = 40): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}

function resetStore(instances: CoreCInstance[] = []): void {
  useInstanceStore.setState({ instances, probing: {}, probeErrors: {} })
}

/** Wait until the probe for `id` has finished (probing flag cleared). */
async function probeSettled(id = 'inst-1'): Promise<void> {
  await waitFor(
    () => {
      expect(useInstanceStore.getState().probing[id]).toBe(false)
    },
    { timeout: 1000 },
  )
}

describe('useHomepageProbe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockReset()
    localStorage.clear()
    sessionStorage.clear()
    resetStore()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('fills lastKnownInfo when all endpoints succeed', async () => {
    vi.useRealTimers()
    resetStore([makeInstance()])
    mockFetch.mockImplementation((url: string) => {
      switch (url) {
        case INFO_URL:
          return Promise.resolve(
            jsonRes({ name: 'edge-node', version: '1.2.3', status: 'running', uptime: '12h' }),
          )
        case STATS_URL:
          return Promise.resolve(
            jsonRes({
              drivers: 2,
              transports: 1,
              rules: 3,
              total_read: 100,
              total_publish: 50,
              total_errors: 1,
              total_dropped: 0,
              points_per_sec: 5,
            }),
          )
        case TAGS_URL:
          return Promise.resolve(jsonRes({ tags: { a: 1, b: 2 } }))
        case RULES_URL:
          return Promise.resolve(jsonRes({ rules: [] }))
        case RAW_CFG_URL:
          return Promise.resolve(new Response('', { status: 200 }))
        default:
          return Promise.resolve(new Response('not found', { status: 404 }))
      }
    })

    const { unmount } = renderHook(() => useHomepageProbe())
    await probeSettled()

    const state = useInstanceStore.getState()
    const info = state.instances[0].lastKnownInfo
    expect(info).toBeDefined()
    expect(info?.name).toBe('edge-node')
    expect(info?.version).toBe('1.2.3')
    expect(info?.status).toBe('running')
    expect(info?.uptime).toBe('12h')
    // GET /stats enriches the card
    expect(info?.stats).toBeDefined()
    expect(info?.stats?.drivers).toBe(2)
    expect(info?.stats?.transports).toBe(1)
    expect(info?.stats?.rules).toBe(3)
    expect(info?.stats?.total_read).toBe(100)
    expect(info?.stats?.points_per_sec).toBe(5)
    // GET /tags → tag_count derived from object key count
    expect(info?.stats?.tag_count).toBe(2)
    // GET / ok → no probe error, probing flag cleared
    expect(state.probeErrors['inst-1']).toBeNull()
    expect(state.probing['inst-1']).toBe(false)

    unmount()
    await flush()
  })

  it("records 'unreachable' when GET / fails (server down / wrong address)", async () => {
    vi.useRealTimers()
    resetStore([makeInstance()])
    mockFetch.mockImplementation((url: string) => {
      if (url === INFO_URL) return Promise.resolve(new Response('down', { status: 503 }))
      return Promise.resolve(jsonRes({}))
    })

    const { unmount } = renderHook(() => useHomepageProbe())
    await probeSettled()

    const state = useInstanceStore.getState()
    // GET / failed → unreachable kind (distinct from an invalid API key).
    expect(state.probeErrors['inst-1']).toBe('unreachable')
    // lastKnownInfo must NOT be updated on failure
    expect(state.instances[0].lastKnownInfo).toBeUndefined()
    expect(state.probing['inst-1']).toBe(false)

    unmount()
    await flush()
  })

  it("records 'unreachable' when GET / rejects with a network error", async () => {
    vi.useRealTimers()
    resetStore([makeInstance()])
    // fetch rejects with TypeError (DNS failure / CORS / connection refused)
    mockFetch.mockImplementation((url: string) => {
      if (url === INFO_URL) return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(jsonRes({}))
    })

    const { unmount } = renderHook(() => useHomepageProbe())
    await probeSettled()

    expect(useInstanceStore.getState().probeErrors['inst-1']).toBe('unreachable')
    unmount()
    await flush()
  })

  it("records 'timeout' when GET / aborts (8s per-request timeout)", async () => {
    vi.useRealTimers()
    resetStore([makeInstance()])
    mockFetch.mockImplementation((url: string) => {
      if (url === INFO_URL) {
        const abortErr = new DOMException('The operation was aborted', 'AbortError')
        return Promise.reject(abortErr)
      }
      return Promise.resolve(jsonRes({}))
    })

    const { unmount } = renderHook(() => useHomepageProbe())
    await probeSettled()

    // AbortError from the per-request timeout → timeout kind, not unreachable.
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBe('timeout')
    unmount()
    await flush()
  })

  it("records 'unauthorized' when GET / is ok but /stats returns 401 (A-01)", async () => {
    vi.useRealTimers()
    resetStore([makeInstance()])
    mockFetch.mockImplementation((url: string) => {
      switch (url) {
        case INFO_URL:
          // Public endpoint is healthy — the address and port are right…
          return Promise.resolve(
            jsonRes({ name: 'edge', version: '1.0.0', status: 'running', uptime: '1h' }),
          )
        case STATS_URL:
          // …but the authenticated endpoint rejects the Bearer key.
          return Promise.resolve(new Response('{"error":"unauthorized"}', { status: 401 }))
        default:
          return Promise.resolve(jsonRes({}))
      }
    })

    const { unmount } = renderHook(() => useHomepageProbe())
    await probeSettled()

    const state = useInstanceStore.getState()
    // The invalid key must surface as a distinct failure kind instead of a
    // green light with silently missing stats.
    expect(state.probeErrors['inst-1']).toBe('unauthorized')
    expect(state.instances[0].lastKnownInfo).toBeUndefined()
    expect(state.instances[0].lastConnectedAt).toBeUndefined()
    expect(state.probing['inst-1']).toBe(false)

    unmount()
    await flush()
  })

  it('tolerates partial failure: /stats 500 but GET / ok keeps connection ok', async () => {
    vi.useRealTimers()
    resetStore([makeInstance()])
    mockFetch.mockImplementation((url: string) => {
      switch (url) {
        case INFO_URL:
          return Promise.resolve(
            jsonRes({ name: 'edge', version: 'v', status: 'ok', uptime: '1h' }),
          )
        case STATS_URL:
          return Promise.resolve(new Response('err', { status: 500 }))
        case TAGS_URL:
          return Promise.resolve(jsonRes({ tags: {} }))
        case RULES_URL:
          return Promise.resolve(jsonRes({ rules: [] }))
        case RAW_CFG_URL:
          return Promise.resolve(new Response('', { status: 200 }))
        default:
          return Promise.resolve(new Response('not found', { status: 404 }))
      }
    })

    const { unmount } = renderHook(() => useHomepageProbe())
    await probeSettled()

    const state = useInstanceStore.getState()
    // GET / ok → connection ok, no error
    expect(state.probeErrors['inst-1']).toBeNull()
    const info = state.instances[0].lastKnownInfo
    expect(info).toBeDefined()
    expect(info?.name).toBe('edge')
    // stats endpoint failed → stats not populated (partial-failure tolerance)
    expect(info?.stats).toBeUndefined()
    expect(state.probing['inst-1']).toBe(false)

    unmount()
    await flush()
  })

  it('aborts in-flight requests on unmount via the fetch abort signal', async () => {
    vi.useRealTimers()
    resetStore([makeInstance()])
    const capturedSignals: AbortSignal[] = []
    mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
      const signal = (opts?.signal ?? undefined) as AbortSignal | undefined
      if (signal) capturedSignals.push(signal)
      // Never resolves on its own; rejects when the abort signal fires so the
      // promise chain settles cleanly instead of hanging.
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const { unmount } = renderHook(() => useHomepageProbe())
    // fetch is called synchronously from probeAll, but yield once to be safe.
    await flush()

    // 5 endpoints probed in parallel → 5 fetch calls captured, none aborted yet
    expect(capturedSignals).toHaveLength(5)
    expect(capturedSignals.every((s) => !s.aborted)).toBe(true)

    unmount()
    // Let the abort-triggered rejection propagate through allSettled.
    await flush()

    // Unmount aborts the parent controller → propagates to every request signal
    expect(capturedSignals.every((s) => s.aborted)).toBe(true)
    // After unmount (active=false) no probe error is recorded
    expect(useInstanceStore.getState().probeErrors['inst-1']).toBeUndefined()
  })

  it('re-probes on the 15s refresh interval', async () => {
    // Fake timers (kept from beforeEach) — only this test advances the clock.
    resetStore([makeInstance()])
    mockFetch.mockImplementation((url: string) => {
      switch (url) {
        case INFO_URL:
          return Promise.resolve(
            jsonRes({ name: 'edge', version: '1', status: 'ok', uptime: '1h' }),
          )
        case STATS_URL:
          return Promise.resolve(jsonRes({ drivers: 1 }))
        case TAGS_URL:
          return Promise.resolve(jsonRes({ tags: {} }))
        case RULES_URL:
          return Promise.resolve(jsonRes({ rules: [] }))
        case RAW_CFG_URL:
          return Promise.resolve(new Response('', { status: 200 }))
        default:
          return Promise.resolve(new Response('not found', { status: 404 }))
      }
    })

    const { unmount } = renderHook(() => useHomepageProbe())
    await flushMicrotasks()

    // First probe runs immediately on mount → 5 fetch calls
    expect(mockFetch).toHaveBeenCalledTimes(5)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    // Second probe after the 15s interval → 10 total fetch calls
    expect(mockFetch).toHaveBeenCalledTimes(10)

    unmount()
    await flushMicrotasks()
  })
})

describe('probeOneInstance (A-03 — immediate probe after add/update)', () => {
  /** Wire all five probe endpoints to healthy responses. */
  function mockHealthyEndpoints() {
    mockFetch.mockImplementation((url: string) => {
      switch (url) {
        case INFO_URL:
          return Promise.resolve(
            jsonRes({ name: 'edge-node', version: '1.2.3', status: 'running', uptime: '1h' }),
          )
        case STATS_URL:
          return Promise.resolve(jsonRes({ drivers: 1 }))
        case TAGS_URL:
          return Promise.resolve(jsonRes({ tags: { a: 1 } }))
        case RULES_URL:
          return Promise.resolve(jsonRes({ rules: [] }))
        case RAW_CFG_URL:
          return Promise.resolve(new Response('', { status: 200 }))
        default:
          return Promise.resolve(new Response('not found', { status: 404 }))
      }
    })
  }

  it('probes the given instance immediately and records the success', async () => {
    resetStore([makeInstance()])
    mockHealthyEndpoints()

    await probeOneInstance('inst-1')

    const state = useInstanceStore.getState()
    const info = state.instances[0].lastKnownInfo
    expect(info?.name).toBe('edge-node')
    expect(info?.version).toBe('1.2.3')
    expect(state.probeErrors['inst-1']).toBeNull()
    expect(state.probing['inst-1']).toBe(false)
    expect(state.instances[0].lastConnectedAt).toBeTruthy()
  })

  it("records the 'unauthorized' kind when the key is rejected", async () => {
    resetStore([makeInstance()])
    mockHealthyEndpoints()
    mockFetch.mockImplementation((url: string) =>
      url === STATS_URL
        ? Promise.resolve(new Response('{"error":"unauthorized"}', { status: 401 }))
        : url === INFO_URL
          ? Promise.resolve(jsonRes({ name: 'edge', version: '1' }))
          : Promise.resolve(jsonRes({})),
    )

    await probeOneInstance('inst-1')

    const state = useInstanceStore.getState()
    expect(state.probeErrors['inst-1']).toBe('unauthorized')
    expect(state.instances[0].lastKnownInfo).toBeUndefined()
    expect(state.probing['inst-1']).toBe(false)
  })

  it('is a no-op for an unknown instance id', async () => {
    resetStore([makeInstance()])
    mockHealthyEndpoints()

    await probeOneInstance('does-not-exist')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(useInstanceStore.getState().instances[0].lastKnownInfo).toBeUndefined()
  })
})
