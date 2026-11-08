import type React from 'react'
import { cn } from '@/lib/cn'

export interface ChartLegendItem {
  label: string
  color: string
  /** Latest sample — shown next to the label so the chart reads at a glance. */
  value?: string | number
}

/** Compact series legend with the current value. */
export const ChartLegend: React.FC<{
  items: ChartLegendItem[]
  action?: React.ReactNode
  className?: string
}> = ({ items, action, className }) => (
  <div
    className={cn(
      'mb-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-muted-foreground',
      className,
    )}
  >
    {items.map((item) => (
      <span key={item.label} className="inline-flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: item.color }}
          aria-hidden
        />
        <span>{item.label}</span>
        {item.value !== undefined && (
          <span className="font-mono tnum text-foreground/80">{item.value}</span>
        )}
      </span>
    ))}
    {action}
  </div>
)
