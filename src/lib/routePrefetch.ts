/**
 * Nav-hover route warming.
 *
 * The sidebar knows the destination before the click, so the matching lazy
 * chunk can be fetched during the ~100ms the pointer spends on the item.
 * The module import map is static on purpose: Rollup reuses the exact same
 * chunks as App.tsx, so this adds no duplicate code — only earlier fetches.
 */
const loaders: Record<string, () => Promise<unknown>> = {
  '/monitor/dashboard': () => import('@/features/monitor/DashboardPage'),
  '/monitor/tags': () => import('@/features/monitor/TagExplorerPage'),
  '/monitor/alerts': () => import('@/features/monitor/AlertsPage'),
  '/admin/drivers': () => import('@/features/admin/DriversPage'),
  '/admin/transports': () => import('@/features/admin/TransportsPage'),
  '/admin/rules': () => import('@/features/admin/RulesPage'),
  '/admin/write': () => import('@/features/admin/WriteControlPage'),
  '/admin/config': () => import('@/features/admin/ConfigCenterPage'),
  '/admin/topology': () => import('@/features/admin/TopologyPage'),
  '/admin/diagnostics': () => import('@/features/admin/DiagnosticsPage'),
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
