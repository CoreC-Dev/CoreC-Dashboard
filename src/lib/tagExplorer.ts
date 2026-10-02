import type { DataPoint } from '@/types/models'

/** Virtualized row height (px) for the tag table. */
export const ROW_HEIGHT = 48
/** Max samples retained in the live trend chart sliding window. */
export const MAX_TREND_SAMPLES = 100

/** Fixed percentage column widths — header and rows share these so columns
 *  stay aligned inside the virtualized (display:block) table. */
export const COLS = {
  tag: '20%',
  driver: '12%',
  group: '10%',
  value: '14%',
  type: '10%',
  quality: '10%',
  timestamp: '16%',
  actions: '8%',
} as const

/**
 * Composite identity for a physical tag point.
 *
 * CoreC's REST `/tags` cache is keyed by tag NAME only, so the same tag name
 * served by two different drivers (or devices) collides. The WS stream carries
 * the full {driver, device, tag} tuple, so we key the live merge map by all
 * three to keep cross-driver same-name tags distinct.
 */
export const tagKey = (p: Pick<DataPoint, 'driver' | 'device' | 'tag'>): string =>
  `${p.driver}::${p.device ?? ''}::${p.tag}`

/** Whether a CoreC data type string represents a numeric (int/uint/float) tag. */
export const isNumericType = (type: string): boolean =>
  type.startsWith('int') || type.startsWith('uint') || type.startsWith('float')

/** Parse an ISO timestamp to whole seconds, falling back to "now" when absent
 *  or unparseable (matches the WS stream's epoch-second time axis). */
export const toSeconds = (ts: string | undefined): number => {
  if (!ts) return Math.floor(Date.now() / 1000)
  const parsed = Date.parse(ts)
  return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000)
}

/** One sampled point on the live trend chart. */
export interface TrendSample {
  time: number
  value: number
}
