/**
 * Nav-hover route warming. The import map is registered by the App layer
 * (registerRouteLoaders); this module owns only the dedup/test-guard logic.
 */
let loaders: Record<string, () => Promise<unknown>> = {}

/** Install the route-suffix → lazy-chunk loader map (App layer owns the feature imports). */
export function registerRouteLoaders(map: Record<string, () => Promise<unknown>>): void {
  loaders = map
}

const warmed = new Set<string>()

/** Warm the chunk behind a full nav path (`/corec/:id/monitor/tags`). */
export function prefetchRoute(path: string): void {
  // jsdom tests hover nav items; importing a whole page (and recharts) there
  // would make unit tests slow and noisy for no benefit.
  if (import.meta.env.MODE === 'test') return
  const suffix = path.replace(/^\/corec\/[^/]+/, '')
  if (warmed.has(suffix)) return
  warmed.add(suffix)
  void loaders[suffix]?.()
}
