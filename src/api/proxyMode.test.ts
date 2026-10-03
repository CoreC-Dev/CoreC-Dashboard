import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectProxyMode,
  getProxyMode,
  resetProxyMode,
  resolveProxyMode,
  setProxyMode,
} from '@/api/proxyMode'

describe('proxyMode (ADR-004 addendum)', () => {
  beforeEach(() => {
    resetProxyMode()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns "proxy" by default before detection runs', () => {
    expect(getProxyMode()).toBe('proxy')
  })

  it('detects "direct" mode when /corec-proxy/ returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
    const result = await detectProxyMode()
    expect(result).toBe('direct')
    expect(getProxyMode()).toBe('direct')
  })

  it('detects "proxy" mode when /corec-proxy/ returns 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    const result = await detectProxyMode()
    expect(result).toBe('proxy')
    expect(getProxyMode()).toBe('proxy')
  })

  it('detects "proxy" mode when /corec-proxy/ returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    const result = await detectProxyMode()
    expect(result).toBe('proxy')
  })

  it('falls back to "direct" on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    const result = await detectProxyMode()
    expect(result).toBe('direct')
    expect(getProxyMode()).toBe('direct')
  })

  it('caches the result — second call does not re-probe', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 404 }))
    await detectProxyMode()
    await detectProxyMode()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('setProxyMode overrides the mode without probing', () => {
    setProxyMode('direct')
    expect(getProxyMode()).toBe('direct')
    setProxyMode('proxy')
    expect(getProxyMode()).toBe('proxy')
  })

  describe('resolveProxyMode — per-instance override', () => {
    it('returns "proxy" when useProxy is "proxy" regardless of global mode', () => {
      setProxyMode('direct') // global is direct
      expect(resolveProxyMode('proxy')).toBe('proxy')
    })

    it('returns "direct" when useProxy is "direct" regardless of global mode', () => {
      setProxyMode('proxy') // global is proxy
      expect(resolveProxyMode('direct')).toBe('direct')
    })

    it('falls back to global mode when useProxy is "auto"', () => {
      setProxyMode('proxy')
      expect(resolveProxyMode('auto')).toBe('proxy')
      setProxyMode('direct')
      expect(resolveProxyMode('auto')).toBe('direct')
    })

    it('falls back to global mode when useProxy is undefined', () => {
      setProxyMode('proxy')
      expect(resolveProxyMode(undefined)).toBe('proxy')
      setProxyMode('direct')
      expect(resolveProxyMode(undefined)).toBe('direct')
    })
  })
})
