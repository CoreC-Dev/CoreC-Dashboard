import type { TFunction } from 'i18next'

/**
 * Format a timestamp as a compact relative-time label
 * (e.g. "刚刚", "3分钟前", "2小时前", "5天前"). Returns '' for a missing
 * timestamp. Mirrors the helper used by InstanceCard so rule stat cells and
 * instance cards share one presentation style.
 *
 * Pure: takes `t` explicitly instead of importing the i18n singleton (TD-ARCH-009).
 */
export function formatRelativeTime(ts: string | null | undefined, t: TFunction): string {
  if (!ts) return ''
  const time = new Date(ts).getTime()
  if (Number.isNaN(time)) return ''
  const diff = Date.now() - time
  if (diff < 60_000) return t('common.justNow')
  if (diff < 3_600_000) return t('common.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('common.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return t('common.daysAgo', { count: Math.floor(diff / 86_400_000) })
}
