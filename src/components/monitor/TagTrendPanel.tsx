import { Activity, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  /** Close the drawer (Escape key or X button). */
  onClose: () => void
}

/** Right-column live trend chart + tag detail panel.
 *  Extracted verbatim from TagExplorerPage — same classes & i18n keys. */
export function TagTrendPanel({
  trendTag,
  trendLivePoint,
  trendSamples,
  onClose,
}: TagTrendPanelProps) {
  const { t } = useTranslation()
  const { chartContainerRef } = useTrendChart({ trendTag, trendSamples })
  const trendNumeric = isNumericType(trendTag.type)

  return (
    <Card
      className="w-full md:w-[440px] shrink-0 flex flex-col self-stretch overflow-hidden border-border bg-card"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
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
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {trendNumeric ? (
          <>
            <div className="text-xs text-muted-foreground">
              {t('tags.liveTrend', { count: trendSamples.length, max: MAX_TREND_SAMPLES })}
            </div>
            <div ref={chartContainerRef} className="w-full h-[320px] [&_canvas]:outline-none" />
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
    </Card>
  )
}
