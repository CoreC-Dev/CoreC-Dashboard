// Guard: keys that only exist in a page's `defaultValue` fallback are
// invisible to the "both packs aligned" check — zh and en can be perfectly
// symmetric while BOTH miss the same key, leaving raw English copy on the
// main-path pages. This pins the known defaultValue-only keys (and the pack
// symmetry for the namespaces they live in) so a future slip fails here.
import { describe, expect, it } from 'vitest'
import en from '@/i18n/en.json'
import zhCN from '@/i18n/zh-CN.json'

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

/** The 12 keys referenced only via defaultValue. */
const DEFAULT_VALUE_ONLY_KEYS = [
  'dashboard.realtimeMonitor',
  'tags.explorerDesc',
  'alerts.filterPlaceholder',
  'alerts.levelAll',
  'alerts.levelWarning',
  'alerts.levelError',
  'alerts.noMatchingEvents',
  'diagnostics.autoRefresh',
  'topology.received',
  'topology.queueSize',
  'topology.droppedCmds',
  'topology.failed',
] as const

describe('i18n packs — defaultValue-only keys', () => {
  it('every audit-named key resolves in both language packs', () => {
    const zh = new Set(flatKeys(zhCN))
    const enKeys = new Set(flatKeys(en))
    for (const key of DEFAULT_VALUE_ONLY_KEYS) {
      expect(zh.has(key), `zh-CN.json missing "${key}"`).toBe(true)
      expect(enKeys.has(key), `en.json missing "${key}"`).toBe(true)
    }
  })

  it('zh and en are key-symmetric in the defaultValue-only namespaces', () => {
    const namespaces = ['dashboard', 'tags', 'alerts', 'diagnostics', 'topology'] as const
    for (const ns of namespaces) {
      const section = zhCN[ns] as unknown as Record<string, unknown>
      const enSection = en[ns] as unknown as Record<string, unknown>
      const zhKeys = new Set(flatKeys(section, `${ns}.`))
      const enKeys = new Set(flatKeys(enSection, `${ns}.`))
      expect(
        [...zhKeys].filter((k) => !enKeys.has(k)),
        `${ns}: en missing keys`,
      ).toEqual([])
      expect(
        [...enKeys].filter((k) => !zhKeys.has(k)),
        `${ns}: zh missing keys`,
      ).toEqual([])
    }
  })
})
