import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format an uptime value for display.
 *
 * - number: nanoseconds since start → "1d 2h 3m 4s" (CoreC /stats.uptime).
 * - string: Go duration like "1h30m45.123s" → "1h 30m" (CoreC /.uptime).
 *   "0s" or empty → "". Unrecognized strings pass through unchanged.
 * - null/undefined → "".
 */
export function formatUptime(uptime: string | number | null | undefined): string {
  if (uptime == null) return ''
  if (typeof uptime === 'string') {
    if (!uptime || uptime === '0s') return ''
    // Go durations: "1h30m45.123s", "25m40.650422s", "5.5s"
    // Seconds can have a decimal fraction — only take the integer part.
    const h = uptime.match(/(\d+)h/)
    const m = uptime.match(/(\d+)m/)
    const s = uptime.match(/(\d+)(?:\.\d+)?s/)
    const hours = h ? parseInt(h[1], 10) : 0
    const mins = m ? parseInt(m[1], 10) : 0
    const secs = s ? parseInt(s[1], 10) : 0
    if (hours > 0) return `${hours}h ${mins}m`
    if (mins > 0) return `${mins}m ${secs}s`
    if (secs > 0) return `${secs}s`
    return uptime
  }
  // Nanoseconds to seconds
  const totalSeconds = Math.floor(uptime / 1e9)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join(' ')
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Detect Go's zero-value timestamp "0001-01-01T00:00:00Z" and Unix epoch
 * "1970-01-01T00:00:00Z" (which CoreC emits for rule hit_at/miss_at via
 * time.Unix(0,...) in rule/wrapper.go — the contract claims Go zero time,
 * but the live server emits Unix epoch). Also catches timezone-shifted
 * variants like "1970-01-01T08:00:00+08:00" by checking getTime() <= 0
 * relative to epoch start (timezone offset doesn't change the underlying
 * instant). A zero/epoch-time string is truthy, so a plain `ts ? ... :
 * 'Never'` check never reaches the fallback.
 */
export function isZeroTime(ts: string | null | undefined): boolean {
  if (!ts) return true
  if (ts.startsWith('0001-01-01')) return true
  if (ts.startsWith('1970-01-01')) return true
  // Catch any timestamp at or before Unix epoch (timezone variants).
  const d = new Date(ts)
  if (!Number.isNaN(d.getTime()) && d.getTime() <= 0) return true
  return false
}

/**
 * Format a timestamp as a compact relative-time label
 * (e.g. "刚刚", "3分钟前", "2小时前", "5天前"). Returns '' for a missing
 * timestamp. Mirrors the helper used by InstanceCard so rule stat cells and
 * instance cards share one presentation style. Uses i18n so the label
 * respects the current locale.
 */
export function formatRelativeTime(ts: string | null | undefined): string {
  if (!ts) return ''
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return i18n.t('common.justNow')
  if (diff < 3_600_000) return i18n.t('common.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return i18n.t('common.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return i18n.t('common.daysAgo', { count: Math.floor(diff / 86_400_000) })
}

/**
 * Compact number formatter with k/M suffixes for card metrics.
 * 0–999 → as-is; 1k–999k → "1.2k"; ≥1M → "3.4M".
 */
export function formatCompact(num: number): string {
  if (num < 1000) return String(num)
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}k`
  return `${(num / 1_000_000).toFixed(1)}M`
}
