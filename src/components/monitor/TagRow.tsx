import { Send } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { QualityLabel } from '@/lib/constants'
import { COLS, ROW_HEIGHT } from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

export interface TagRowProps {
  point: DataPoint
  start: number
  flashTick: number
  onOpen: (point: DataPoint) => void
  onWrite: (point: DataPoint) => void
}

// memo'd so a WS update to one tag re-renders only that row. The callbacks
// below (openTrend / handleWriteClick) are stabilized with useCallback, and
// unchanged rows keep the same `point` reference (setTagMap spreads the map
// without touching other keys), so unaffected rows bail out of re-rendering.
export const TagRow = memo(function TagRow({
  point,
  start,
  flashTick,
  onOpen,
  onWrite,
}: TagRowProps) {
  const { t } = useTranslation()
  const overlayRef = useRef<HTMLDivElement>(null)
  // Last numeric value seen at a flash — used to tint the flash green (rise)
  // or red (fall). Updated inside the flashTick effect so it stays in sync
  // with the WAAPI replay. Ref (not state) to avoid extra re-renders.
  const lastValueRef = useRef<number | null>(null)
  const [flashDir, setFlashDir] = useState<'up' | 'down' | 'none'>('none')

  // Replay a 1s tint flash whenever this row receives a fresh WS update.
  // Direction (green rise / red fall) is derived from the numeric value
  // delta; non-numeric or unchanged values fall back to the primary tint.
  // WAAPI animates only opacity — the tint comes from the overlay class.
  // biome-ignore lint/correctness/useExhaustiveDependencies: point.value is coupled to flashTick (WS updates drive both); recompute only on flashTick.
  useEffect(() => {
    if (flashTick <= 0) return
    const el = overlayRef.current
    if (!el) return
    const num =
      typeof point.value === 'number'
        ? point.value
        : typeof point.value === 'boolean'
          ? point.value
            ? 1
            : 0
          : null
    const prev = lastValueRef.current
    setFlashDir(
      num !== null && prev !== null && num !== prev ? (num > prev ? 'up' : 'down') : 'none',
    )
    lastValueRef.current = num
    const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 1000,
      easing: 'ease-out',
      fill: 'forwards',
    })
    return () => anim.cancel()
  }, [flashTick])

  const q = QualityLabel[point.quality] ?? QualityLabel[0]

  return (
    <tr
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: ROW_HEIGHT,
        transform: `translateY(${start}px)`,
      }}
      tabIndex={0}
      aria-label={`${point.driver}:${point.tag} — ${point.value}`}
      className="flex items-center cursor-pointer border-b border-border hover:bg-muted/30 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      onClick={() => onOpen(point)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(point)
        }
      }}
    >
      <td
        className="px-4 py-2.5 shrink-0 min-w-0 truncate font-mono font-semibold text-foreground"
        style={{ width: COLS.tag }}
      >
        {point.tag}
      </td>
      <td
        className="px-4 py-2.5 shrink-0 min-w-0 truncate font-mono text-muted-foreground"
        style={{ width: COLS.driver }}
      >
        {point.driver}
      </td>
      <td
        className="px-4 py-2.5 shrink-0 min-w-0 truncate text-muted-foreground"
        style={{ width: COLS.group }}
      >
        {point.group || '-'}
      </td>
      <td className="px-4 py-2.5 shrink-0 min-w-0 overflow-hidden" style={{ width: COLS.value }}>
        <span className="inline-block font-mono text-sm font-bold bg-muted/60 px-2 py-0.5 rounded text-foreground truncate max-w-full align-middle">
          {typeof point.value === 'boolean'
            ? point.value
              ? t('tags.trueValue')
              : t('tags.falseValue')
            : String(point.value)}
        </span>
      </td>
      <td className="px-4 py-2.5 shrink-0 min-w-0" style={{ width: COLS.type }}>
        <Badge variant="outline" className="font-mono text-xs py-0 h-5">
          {point.type}
        </Badge>
      </td>
      <td className="px-4 py-2.5 shrink-0 min-w-0" style={{ width: COLS.quality }}>
        <Badge variant="outline" className={cn('text-xs h-5', q.color)}>
          {t(q.key)}
        </Badge>
      </td>
      <td
        className="px-4 py-2.5 shrink-0 min-w-0 truncate text-muted-foreground font-mono text-xs"
        style={{ width: COLS.timestamp }}
      >
        {point.timestamp ? new Date(point.timestamp).toLocaleTimeString() : '-'}
        {point.is_stale && (
          <span className="ml-1.5 text-xs text-status-warning border border-status-warning/30 px-1 rounded">
            {t('tags.stale')}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 shrink-0 min-w-0 text-right" style={{ width: COLS.actions }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onWrite(point)
          }}
          className="h-9 px-2 text-xs text-primary hover:bg-primary/10"
        >
          <Send className="w-3 h-3 mr-1" />
          <span>{t('tags.write')}</span>
        </Button>
      </td>
      {flashTick > 0 && (
        <div
          ref={overlayRef}
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0',
            flashDir === 'up'
              ? 'bg-status-running/10'
              : flashDir === 'down'
                ? 'bg-status-error/10'
                : 'bg-primary/10',
          )}
        />
      )}
    </tr>
  )
})
