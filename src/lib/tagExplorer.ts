import type { DataPoint } from '@/types/models'

/** Virtualized row height (px) for the tag table. */
export const ROW_HEIGHT = 48
/** Max samples retained in the live trend chart sliding window. */
export const MAX_TREND_SAMPLES = 100

/** Fixed percentage column widths — header and rows share these so columns
 *  stay aligned inside the virtualized (display:block) table. B06 added the
 *  device column (2% each from tag/driver/group/type, total still 100%) so
 *  same-name tags on different sub-devices are distinguishable at a glance. */
export const COLS = {
  tag: '18%',
  driver: '10%',
  device: '8%',
  group: '8%',
  value: '14%',
  type: '8%',
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

/** One sampled point on the live trend chart. A sample WITHOUT `value` is a
 *  whitespace gap marker: lightweight-charts breaks the line there instead of
 *  drawing a fabricated segment across the pause period (B08). */
export interface TrendSample {
  time: number
  value?: number
}

/**
 * B08 — append a value-less gap sample one second after the last real sample.
 * Inserted on trend RESUME so the paused period renders as a blank gap, not a
 * straight line pretending the data was continuous. Pure; no-op on an empty
 * buffer (nothing to break yet).
 */
export const insertPauseGap = (samples: TrendSample[]): TrendSample[] => {
  const last = samples[samples.length - 1]
  if (!last) return samples
  return [...samples, { time: last.time + 1 }]
}

/** B07 — quality/staleness filter for the tag explorer's problem-point hunt.
 *  Quality codes come straight from DataPoint: 0=Good, 1=Bad, 2=Uncertain. */
export type QualityFilter = 'all' | 'good' | 'bad' | 'uncertain'

export const QUALITY_CODES: Record<Exclude<QualityFilter, 'all'>, number> = {
  good: 0,
  bad: 1,
  uncertain: 2,
}

/** Whether a point survives the quality Select + the "stale tags only" toggle.
 *  Pure so the page memo and the unit tests share the exact same rules. */
export const matchesQualityFilter = (
  point: Pick<DataPoint, 'quality' | 'is_stale'>,
  quality: QualityFilter,
  staleOnly: boolean,
): boolean => {
  if (quality !== 'all' && point.quality !== QUALITY_CODES[quality]) return false
  if (staleOnly && !point.is_stale) return false
  return true
}

// ─── B15: honest timestamps ─────────────────────────────────────────────────

/** Past this age a timestamp cell dims — the audit's ">5 分钟降低透明度"
 *  horizon: an old frozen value must stop looking as fresh as a live one. */
export const RELATIVE_DIM_MS = 5 * 60_000

/** Minimal t() surface — keeps this lib free of an i18n instance dependency
 *  (FRONTEND.md: formatters take t explicitly). */
export type Translate = (key: string, opts?: { count?: number }) => string

/** Display shape for a monitor timestamp (B15).
 *  - <60s old → common.justNow ("刚刚" / "just now")
 *  - 1–59min  → common.minutesAgo ("3分钟前" / "3m ago")
 *  - 1–23h    → common.hoursAgo; ≥24h → common.daysAgo
 *  - older than RELATIVE_DIM_MS (5min) the caller dims the cell, and the
 *    full locale date-time rides along for the hover tooltip — a stale
 *    "09:15:32" from yesterday no longer reads as just-refreshed.
 *  - a MISSING timestamp is the most suspect: renders '-' and dims. */
export interface RelativeTimestamp {
  text: string
  /** Full date-time for the title tooltip. */
  full: string
  /** true when older than the 5-minute dim horizon (or unknown). */
  dim: boolean
}

export const formatRelativeTime = (ts: string | undefined, t: Translate): RelativeTimestamp => {
  const date = ts ? new Date(ts) : null
  if (!date || Number.isNaN(date.getTime())) return { text: '-', full: '-', dim: true }
  const full = date.toLocaleString()
  const ageMs = Date.now() - date.getTime()
  // Future timestamps (clock skew) count as "just now" — never a negative age.
  if (ageMs < 60_000) return { text: t('common.justNow'), full, dim: false }
  const minutes = Math.floor(ageMs / 60_000)
  const dim = ageMs > RELATIVE_DIM_MS
  if (minutes < 60) return { text: t('common.minutesAgo', { count: minutes }), full, dim }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { text: t('common.hoursAgo', { count: hours }), full, dim }
  return { text: t('common.daysAgo', { count: Math.floor(hours / 24) }), full, dim }
}
