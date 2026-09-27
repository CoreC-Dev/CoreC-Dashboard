import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUptime(uptime: string | number): string {
  if (typeof uptime === 'string') return uptime
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

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
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
