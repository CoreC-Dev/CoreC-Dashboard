import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

interface ChartStatusOverlayProps {
  /** The stream left 'open' involuntarily and is not back yet (B01
   *  semantics) — the chart is frozen, not merely quiet. */
  disconnected: boolean
  /** True while not a single frame has rendered yet. */
  empty: boolean
}

/**
 * B20 — honesty overlay for the two stream charts (/traffic, /memory).
 *
 * On first load a bare pair of axes can't answer "no data yet or not
 * connected?", and after a disconnect the chart just silently froze.
 * This pill says which one it is:
 *  - empty + connected  → 「等待实时数据…」 "Waiting for live data…"
 *  - disconnected       → 「连接中断，图表已暂停更新」
 *                         "Disconnected — chart updates paused"
 *
 * It floats above the (possibly frozen) chart with pointer-events-none so
 * hover/tooltips on the underlying data keep working.
 */
export function ChartStatusOverlay({ disconnected, empty }: ChartStatusOverlayProps) {
  const { t } = useTranslation()
  if (!disconnected && !empty) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <span
        className={cn(
          'rounded-full border px-3 py-1 text-xs font-medium',
          disconnected
            ? 'border-status-error/40 bg-status-error/10 text-status-error'
            : 'border-border bg-muted/50 text-muted-foreground',
        )}
      >
        {disconnected ? t('dashboard.chartDisconnected') : t('dashboard.chartWaiting')}
      </span>
    </div>
  )
}
