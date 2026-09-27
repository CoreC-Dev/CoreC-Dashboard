import { Check, LayoutGrid, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { CardType } from '@/types/dashboard'

const CARD_TYPES: {
  type: CardType
  titleKey: string
  descKey: string
  defaultH: number
  defaultW: number
}[] = [
  {
    type: 'kpi-summary',
    titleKey: 'dashboardEditor.cardKpiSummaryTitle',
    descKey: 'dashboardEditor.cardKpiSummaryDesc',
    defaultW: 12,
    defaultH: 3,
  },
  {
    type: 'traffic-chart',
    titleKey: 'dashboardEditor.cardTrafficChartTitle',
    descKey: 'dashboardEditor.cardTrafficChartDesc',
    defaultW: 6,
    defaultH: 5,
  },
  {
    type: 'memory-chart',
    titleKey: 'dashboardEditor.cardMemoryChartTitle',
    descKey: 'dashboardEditor.cardMemoryChartDesc',
    defaultW: 6,
    defaultH: 5,
  },
  {
    type: 'driver-status-list',
    titleKey: 'dashboardEditor.cardDriverMatrixTitle',
    descKey: 'dashboardEditor.cardDriverMatrixDesc',
    defaultW: 6,
    defaultH: 6,
  },
  {
    type: 'transport-status-list',
    titleKey: 'dashboardEditor.cardTransportMatrixTitle',
    descKey: 'dashboardEditor.cardTransportMatrixDesc',
    defaultW: 6,
    defaultH: 6,
  },
  {
    type: 'recent-alerts',
    titleKey: 'dashboardEditor.cardAlertsTitle',
    descKey: 'dashboardEditor.cardAlertsDesc',
    defaultW: 12,
    defaultH: 4,
  },
]

export const DashboardEditorPage: React.FC = () => {
  const { currentLayout, addCard, removeCard, resetToDefault } = useDashboardStore()
  const { t } = useTranslation()
  const [savedNotice, setSavedNotice] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending "Saved!" auto-hide timer on unmount so we never call
  // setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const handleAdd = (item: (typeof CARD_TYPES)[0]) => {
    addCard({
      type: item.type,
      title: t(item.titleKey),
      layout: {
        x: 0,
        y: Infinity, // place at bottom
        w: item.defaultW,
        h: item.defaultH,
      },
    })
  }

  const handleSave = () => {
    setSavedNotice(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSavedNotice(false), 2500)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('dashboardEditor.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('dashboardEditor.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            <span>{t('dashboardEditor.resetDefault')}</span>
          </Button>

          <Button size="sm" onClick={handleSave} className="h-8 text-xs glow-primary font-semibold">
            {savedNotice ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                <span>{t('dashboardEditor.savedToStorage')}</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1" />
                <span>{t('dashboardEditor.saveLayout')}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Available Card Catalog */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <Plus className="w-4 h-4 text-primary" />
            <span>{t('dashboardEditor.catalog')}</span>
          </CardTitle>
          <CardDescription className="text-xs">{t('dashboardEditor.catalogDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CARD_TYPES.map((item) => (
              <div
                key={item.type}
                className="p-3 rounded-lg border border-border/80 bg-card/40 hover:border-primary/50 transition-all flex flex-col justify-between space-y-2 group"
              >
                <div>
                  <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                    {t(item.titleKey)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {t(item.descKey)}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {`${item.defaultW}x${item.defaultH} ${t('dashboardEditor.grid')}`}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAdd(item)}
                    className="h-7 px-2 text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    <span>{t('dashboardEditor.add')}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Layout Cards List */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <span>{t('dashboardEditor.activeCards', { count: currentLayout.cards.length })}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {t('dashboardEditor.activeCardsDesc')}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 pt-1 space-y-2">
          {currentLayout.cards.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border-dashed border rounded-lg">
              {t('dashboardEditor.noCards')}
            </div>
          ) : (
            currentLayout.cards.map((card, idx) => (
              <div
                key={card.id}
                className="p-3 rounded-lg border border-border/70 bg-card/40 flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-3">
                  <span className="w-5 h-5 rounded bg-muted flex items-center justify-center font-mono text-[10px] text-muted-foreground">
                    #{idx + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-foreground">{card.title}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {`${t('dashboardEditor.type')}: ${card.type} • ${t('dashboardEditor.span')}: ${card.layout.w} ${t('dashboardEditor.cols')} x ${card.layout.h} ${t('dashboardEditor.rows')}`}
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCard(card.id)}
                  aria-label={t('common.delete')}
                  className="h-8 w-8 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
