// Nav-hover warming: the App layer registers the lazy-chunk loaders; this
// module only dedups and guards test mode.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefetchRoute, registerRouteLoaders } from '@/lib/routePrefetch'

afterEach(() => {
  vi.unstubAllEnvs()
  registerRouteLoaders({})
})

describe('routePrefetch', () => {
  it('warms the registered loader for a full instance nav path', () => {
    vi.stubEnv('MODE', 'production')
    const loader = vi.fn().mockResolvedValue(undefined)
    registerRouteLoaders({ '/monitor/tags': loader })

    prefetchRoute('/corec/inst-1/monitor/tags')

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('warms each route suffix only once', () => {
    vi.stubEnv('MODE', 'production')
    const loader = vi.fn().mockResolvedValue(undefined)
    registerRouteLoaders({ '/admin/drivers': loader })

    prefetchRoute('/corec/inst-1/admin/drivers')
    prefetchRoute('/corec/inst-2/admin/drivers')

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('is a safe no-op for unregistered paths', () => {
    vi.stubEnv('MODE', 'production')
    registerRouteLoaders({})

    expect(() => prefetchRoute('/corec/inst-1/monitor/unknown')).not.toThrow()
  })

  it('never warms in test mode', () => {
    const loader = vi.fn().mockResolvedValue(undefined)
    registerRouteLoaders({ '/monitor/dashboard': loader })

    prefetchRoute('/corec/inst-1/monitor/dashboard')

    expect(loader).not.toHaveBeenCalled()
  })
})
