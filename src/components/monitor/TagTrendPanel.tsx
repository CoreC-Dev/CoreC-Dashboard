import { Activity, Download, Maximize2, Pause, Play, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTrendChart } from '@/hooks/useTrendChart'
import { QualityLabel } from '@/lib/constants'
import { isNumericType, MAX_TREND_SAMPLES, type TrendSample } from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

interface TagTrendPanelProps {
  /** Tag shown in the drawer (always non-null — panel only renders when open). */
  trendTag: DataPoint
  /** Live-updating point for the detail panel (falls back to the open-time
   *  snapshot when the tag isn't in the live map yet). */
  trendLivePoint: DataPoint | null
  /** Buffered trend samples for the chart. */
  trendSamples: TrendSample[]
  /** Whether the trend chart is paused. */
  trendPaused: boolean
  /** Toggle pause/resume. */
  onTogglePause: () => void
  /** Close the drawer (Escape key or X button). */
  onClose: () => void
}

/** Format a numeric value for compact display in the stats bar. */
function fmt(v: number): string {
  if (Number.isInteger(v)) return v.toString()
  return v.toFixed(3)
}

/** Export trend samples as a CSV file download. */
function exportCsv(tag: string, samples: TrendSample[]) {
  const header = 'timestamp,datetime,value\n'
  const rows = samples
    .map((s) => {
      const dt = new Date(s.time * 1000).toISOString()
      return `${s.time},${dt},${s.value}`
    })
    .join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trend_${tag}_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Right-column live trend chart + tag detail panel.
 *  Extracted verbatim from TagExplorerPage — same classes & i18n keys. */
export function TagTrendPanel({
  trendTag,
  trendLivePoint,
  trendSamples,
  trendPaused,
  onTogglePause,
  onClose,
}: TagTrendPanelProps) {
  const { t } = useTranslation()
  const { chartContainerRef } = useTrendChart({ trendTag, trendSamples })
  const trendNumeric = isNumericType(trendTag.type)

  // Fullscreen chart dialog state.
  const [fullscreen, setFullscreen] = useState(false)
  const { chartContainerRef: fullscreenChartRef } = useTrendChart({
    trendTag: fullscreen ? trendTag : null,
    trendSamples,
  })

  // Statistics over the visible trend samples.
  const stats = useMemo(() => {
    if (trendSamples.length === 0) return null
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const s of trendSamples) {
      if (s.value < min) min = s.value
      if (s.value > max) max = s.value
      sum += s.value
    }
    return {
      min,
      max,
      avg: sum / trendSamples.length,
      current: trendSamples[trendSamples.length - 1].value,
    }
  }, [trendSamples])

  return (
    <Card
      className="w-full md:w-[520px] lg:w-[600px] shrink-0 flex flex-col self-stretch overflow-hidden border-border bg-card
      fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-xl shadow-2xl
      md:static md:max-h-none md:rounded-xl md:shadow-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      {/* Mobile drag handle */}
      <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <Activity className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{trendTag.tag}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">
              {trendTag.driver}
              {trendTag.device ? ` · ${trendTag.device}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {trendNumeric && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onTogglePause}
                className="h-8 w-8 p-0"
                title={trendPaused ? t('tags.resume') : t('tags.pause')}
              >
                {trendPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => exportCsv(trendTag.tag, trendSamples)}
                disabled={trendSamples.length === 0}
                className="h-8 w-8 p-0"
                title={t('tags.exportCsv')}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullscreen(true)}
                className="h-8 w-8 p-0"
                title={t('tags.fullscreen')}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {trendNumeric ? (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {t('tags.liveTrend', { count: trendSamples.length, max: MAX_TREND_SAMPLES })}
              </span>
              {trendPaused && (
                <span className="text-status-warning font-semibold">{t('tags.paused')}</span>
              )}
            </div>

            {/* Statistics bar */}
            {stats && (
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    {t('tags.statCurrent')}
                  </div>
                  <div className="font-mono font-semibold text-foreground">
                    {fmt(stats.current)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    {t('tags.statMin')}
                  </div>
                  <div className="font-mono font-semibold text-foreground">{fmt(stats.min)}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    {t('tags.statMax')}
                  </div>
                  <div className="font-mono font-semibold text-foreground">{fmt(stats.max)}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    {t('tags.statAvg')}
                  </div>
                  <div className="font-mono font-semibold text-foreground">{fmt(stats.avg)}</div>
                </div>
              </div>
            )}

            <div
              ref={chartContainerRef}
              className="w-full h-[280px] md:h-[360px] [&_canvas]:outline-none"
            />
          </>
        ) : (
          <div className="text-xs text-muted-foreground py-12 text-center">
            {t('tags.noTrendData')}
          </div>
        )}

        {trendLivePoint && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-mono space-y-1">
            <div>
              <span className="text-muted-foreground">{t('common.type')}: </span>
              <span className="text-foreground">{trendLivePoint.type}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('common.value')}: </span>
              <span className="text-foreground">
                {typeof trendLivePoint.value === 'boolean'
                  ? trendLivePoint.value
                    ? t('tags.trueValue')
                    : t('tags.falseValue')
                  : String(trendLivePoint.value)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('common.quality')}: </span>
              <span className="text-foreground">
                {t((QualityLabel[trendLivePoint.quality] ?? QualityLabel[0]).key)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('common.timestamp')}: </span>
              <span className="text-foreground">
                {trendLivePoint.timestamp
                  ? new Date(trendLivePoint.timestamp).toLocaleString()
                  : '-'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen chart dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">
              {trendTag.driver} · {trendTag.tag}
            </DialogTitle>
          </DialogHeader>
          <div ref={fullscreenChartRef} className="w-full h-[60vh] [&_canvas]:outline-none" />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
