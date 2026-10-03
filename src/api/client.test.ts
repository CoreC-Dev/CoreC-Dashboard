import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveConnection } from '@/api/activeConnection'
import { ApiError, apiRequest } from '@/api/client'
import { resetProxyMode, setProxyMode } from '@/api/proxyMode'

// Mock fetch — each test configures the response it expects (same pattern as
// src/api/endpoints/index.test.ts).
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

beforeEach(() => {
  mockFetch.mockReset()
  resetProxyMode()
  // Seed the active connection so apiRequest builds a valid URL.
  setActiveConnection({
    instanceId: 'test-instance',
    baseUrl: 'http://127.0.0.1:9090',
    secret: 'test-secret-token',
  })
})

afterEach(() => {
  // Restore real timers in case a test installed fake timers.
  vi.useRealTimers()
})

describe('apiRequest — no active connection', () => {
  it('throws ApiError(0) when there is no active connection', async () => {
    setActiveConnection(null)

    let caught: unknown
    try {
      await apiRequest('/configs/raw')
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(0)
    expect((caught as ApiError).message).toMatch(/No active CoreC instance/)
    // fetch must never have been called.
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('apiRequest — error responses', () => {
  it('throws ApiError(401) on a 401 response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"error":"unauthorized"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    let caught: unknown
    try {
      await apiRequest('/configs/raw')
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(401)
    // The error body is surfaced for the caller to inspect.
    expect((caught as ApiError).body).toBe('{"error":"unauthorized"}')
  })
})

describe('apiRequest — 204 No Content', () => {
  it('returns undefined for a 204 response', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await apiRequest('/configs/raw')

    expect(result).toBeUndefined()
  })
})

describe('apiRequest — content-type routing', () => {
  it('parses JSON when content-type is application/json', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, count: 3 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await apiRequest<{ ok: boolean; count: number }>('/configs/raw')

    expect(result).toEqual({ ok: true, count: 3 })
    // Verify the request was shaped correctly (same-origin proxy + headers).
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/corec-proxy/configs/raw')
    expect(init?.headers.get('X-CoreC-Target')).toBe('http://127.0.0.1:9090')
    expect(init?.headers.get('Authorization')).toBe('Bearer test-secret-token')
  })

  it('returns the raw string when content-type is text/plain', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('hello world', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    const result = await apiRequest<string>('/configs/raw')

    expect(result).toBe('hello world')
  })
})

describe('apiRequest — timeout', () => {
  it('throws ApiError(408) when the auto-timeout fires', async () => {
    vi.useFakeTimers()
    // fetch never resolves on its own; it rejects with AbortError when the
    // signal aborts — mirroring real fetch behavior.
    mockFetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )

    const promise = apiRequest('/configs/raw', { timeoutMs: 5000 })
    // Advance past the timeout: the AbortController aborts, fetch rejects
    // with AbortError, and apiRequest translates it to ApiError(408).
    vi.advanceTimersByTime(5000)

    let caught: unknown
    try {
      await promise
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(408)
    expect((caught as ApiError).message).toMatch(/timed out after 5000ms/)
  })
})

describe('apiRequest — caller-supplied signal', () => {
  it('respects a caller-supplied signal and does not auto-translate to 408', async () => {
    const ctrl = new AbortController()
    mockFetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    )

    const promise = apiRequest('/configs/raw', { signal: ctrl.signal })
    // Caller aborts — fetch rejects with AbortError. Because the caller
    // supplied the signal, apiRequest did NOT install an auto-timeout
    // (timeoutId is undefined), so the AbortError is rethrown as-is rather
    // than translated to ApiError(408).
    ctrl.abort()

    let caught: unknown
    try {
      await promise
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).name).toBe('AbortError')
    // Not translated to an ApiError(408).
    expect(caught).not.toBeInstanceOf(ApiError)
  })
})

describe('apiRequest — direct mode (static-host fallback)', () => {
  it('sends directly to baseUrl + path without /corec-proxy prefix', async () => {
    setProxyMode('direct')
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await apiRequest('/configs/raw')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:9090/configs/raw')
    // X-CoreC-Target header is NOT set in direct mode.
    expect(init!.headers.get('X-CoreC-Target')).toBeNull()
    // Authorization header is still set.
    expect(init!.headers.get('Authorization')).toBe('Bearer test-secret-token')
  })

  it('works without a secret in direct mode', async () => {
    setProxyMode('direct')
    setActiveConnection({
      instanceId: 'no-secret',
      baseUrl: 'http://10.0.0.1:8080',
      secret: '',
    })
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await apiRequest('/stats')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('http://10.0.0.1:8080/stats')
    expect(init!.headers.get('Authorization')).toBeNull()
  })
})

describe('apiRequest — per-instance useProxy override', () => {
  it('uses direct mode when global is proxy but instance useProxy is "direct"', async () => {
    setProxyMode('proxy')
    setActiveConnection({
      instanceId: 'test-instance',
      baseUrl: 'http://127.0.0.1:9090',
      secret: 'test-secret-token',
      useProxy: 'direct',
    })
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await apiRequest('/configs/raw')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:9090/configs/raw')
    expect(init!.headers.get('X-CoreC-Target')).toBeNull()
  })

  it('uses proxy mode when global is direct but instance useProxy is "proxy"', async () => {
    setProxyMode('direct')
    setActiveConnection({
      instanceId: 'test-instance',
      baseUrl: 'http://127.0.0.1:9090',
      secret: 'test-secret-token',
      useProxy: 'proxy',
    })
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await apiRequest('/configs/raw')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/corec-proxy/configs/raw')
    expect(init!.headers.get('X-CoreC-Target')).toBe('http://127.0.0.1:9090')
  })
})
