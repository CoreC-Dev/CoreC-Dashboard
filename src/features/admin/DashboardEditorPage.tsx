import {
  Check,
  Download,
  LayoutGrid,
  LayoutTemplate,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Layout } from 'react-grid-layout/legacy'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { CardType, DashboardCard, DashboardLayout } from '@/types/dashboard'

const ResponsiveGridLayout = WidthProvider(Responsive)

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

type TemplateKey = 'overview' | 'production' | 'debug'

interface TemplateDef {
  key: TemplateKey
  labelKey: string
  cards: { type: CardType; layout: DashboardCard['layout'] }[]
}

// Pre-configured layouts that operators can apply with a single click.
const TEMPLATES: TemplateDef[] = [
  {
    key: 'overview',
    labelKey: 'dashboardEditor.templateOverview',
    cards: [
      { type: 'kpi-summary', layout: { x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 3 } },
      { type: 'traffic-chart', layout: { x: 0, y: 3, w: 6, h: 5, minW: 4, minH: 4 } },
      { type: 'memory-chart', layout: { x: 6, y: 3, w: 6, h: 5, minW: 4, minH: 4 } },
      { type: 'driver-status-list', layout: { x: 0, y: 8, w: 6, h: 6, minW: 4, minH: 4 } },
      { type: 'recent-alerts', layout: { x: 6, y: 8, w: 6, h: 6, minW: 4, minH: 3 } },
    ],
  },
  {
    key: 'production',
    labelKey: 'dashboardEditor.templateProduction',
    cards: [
      { type: 'kpi-summary', layout: { x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 3 } },
      { type: 'driver-status-list', layout: { x: 0, y: 3, w: 6, h: 6, minW: 4, minH: 4 } },
      { type: 'transport-status-list', layout: { x: 6, y: 3, w: 6, h: 6, minW: 4, minH: 4 } },
      { type: 'tag-value', layout: { x: 0, y: 9, w: 6, h: 4, minW: 3, minH: 3 } },
      { type: 'recent-alerts', layout: { x: 6, y: 9, w: 6, h: 4, minW: 4, minH: 3 } },
    ],
  },
  {
    key: 'debug',
    labelKey: 'dashboardEditor.templateDebug',
    cards: [
      { type: 'traffic-chart', layout: { x: 0, y: 0, w: 6, h: 5, minW: 4, minH: 4 } },
      { type: 'memory-chart', layout: { x: 6, y: 0, w: 6, h: 5, minW: 4, minH: 4 } },
      { type: 'recent-alerts', layout: { x: 0, y: 5, w: 12, h: 4, minW: 6, minH: 3 } },
      { type: 'tag-table', layout: { x: 0, y: 9, w: 12, h: 6, minW: 6, minH: 4 } },
    ],
  },
]

type Feedback = 'saved' | 'importSuccess' | 'importFailed' | 'templateApplied' | null

const FEEDBACK_KEY: Record<Exclude<Feedback, null>, string> = {
  saved: 'dashboardEditor.savedToStorage',
  importSuccess: 'dashboardEditor.importSuccess',
  importFailed: 'dashboardEditor.importFailed',
  templateApplied: 'dashboardEditor.templateApplied',
}

// Mirrors the private STORAGE_KEY in dashboardStore so imported/template
// layouts persist across reloads (the store exposes no setLayout action).
const LAYOUT_STORAGE_KEY = 'corec_dashboard_layout'

export const DashboardEditorPage: React.FC = () => {
  const { currentLayout, addCard, removeCard, resetToDefault, updateCardLayout } =
    useDashboardStore()
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clear any pending feedback auto-hide timer on unmount so we never call
  // setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  const showFeedback = (kind: Exclude<Feedback, null>) => {
    setFeedback(kind)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 2500)
  }

  const titleForType = (type: CardType): string => {
    const entry = CARD_TYPES.find((c) => c.type === type)
    if (entry) return t(entry.titleKey)
    // tag-value / tag-table have no catalog entry; fall back to a stable label.
    if (type === 'tag-value') return 'Tag Value'
    if (type === 'tag-table') return 'Tag Table'
    return type
  }

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
    showFeedback('saved')
  }

  // Sync react-grid-layout drag/resize changes back to the dashboard store.
  const handleLayoutChange = (newLayout: Layout[]) => {
    updateCardLayout(
      newLayout.map((item) => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })),
    )
  }

  const exportLayout = () => {
    const blob = new Blob([JSON.stringify(currentLayout, null, 2)], {
      type: 'application/json',
    })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = 'corec-dashboard-layout.json'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(objectUrl)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      try {
        const parsed = JSON.parse(typeof text === 'string' ? text : '')
        if (!parsed || !Array.isArray(parsed.cards)) {
          showFeedback('importFailed')
          return
        }
        const now = Date.now()
        const newLayout: DashboardLayout = {
          id: typeof parsed.id === 'string' ? parsed.id : `imported-${now}`,
          name: typeof parsed.name === 'string' ? parsed.name : 'Imported Layout',
          description: typeof parsed.description === 'string' ? parsed.description : undefined,
          cards: parsed.cards,
          createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : now,
          updatedAt: now,
        }
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayout))
        useDashboardStore.setState({ currentLayout: newLayout })
        showFeedback('importSuccess')
      } catch {
        showFeedback('importFailed')
      }
    }
    reader.onerror = () => showFeedback('importFailed')
    reader.readAsText(file)
    // Reset so re-selecting the same file fires `change` again.
    e.target.value = ''
  }

  const applyTemplate = (template: TemplateDef) => {
    const now = Date.now()
    const cards: DashboardCard[] = template.cards.map((c, idx) => ({
      id: `${template.key}-${c.type}-${idx}`,
      type: c.type,
      title: titleForType(c.type),
      layout: { ...c.layout },
    }))
    const newLayout: DashboardLayout = {
      id: `template-${template.key}`,
      name: t(template.labelKey),
      description: t('dashboardEditor.templatesDesc'),
      cards,
      createdAt: now,
      updatedAt: now,
    }
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayout))
    useDashboardStore.setState({ currentLayout: newLayout })
    showFeedback('templateApplied')
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('dashboardEditor.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('dashboardEditor.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportLayout} className="h-8 text-xs">
            <Download className="w-3.5 h-3.5 mr-1" />
            <span>{t('dashboardEditor.export')}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs"
          >
            <Upload className="w-3.5 h-3.5 mr-1" />
            <span>{t('dashboardEditor.import')}</span>
          </Button>

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
            {feedback === 'saved' ? (
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

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {feedback && feedback !== 'saved' && (
        <div
          className={`text-xs font-medium px-3 py-2 rounded-lg border ${
            feedback === 'importFailed'
              ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
              : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
          }`}
        >
          {t(FEEDBACK_KEY[feedback])}
        </div>
      )}

      {/* Preset Templates */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <LayoutTemplate className="w-4 h-4 text-primary" />
            <span>{t('dashboardEditor.templates')}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {t('dashboardEditor.templatesDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tpl) => (
              <Button
                key={tpl.key}
                variant="outline"
                size="sm"
                onClick={() => applyTemplate(tpl)}
                className="h-8 text-xs"
              >
                <LayoutTemplate className="w-3.5 h-3.5 mr-1 text-primary" />
                <span>{t(tpl.labelKey)}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

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

      {/* Live Grid Preview — drag & resize */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <span>{t('dashboardEditor.gridPreview')}</span>
            <Badge variant="outline" className="text-[10px] font-mono ml-2">
              {currentLayout.cards.length}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            {t('dashboardEditor.gridPreviewDesc')}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 pt-1">
          {currentLayout.cards.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border-dashed border rounded-lg">
              {t('dashboardEditor.noCards')}
            </div>
          ) : (
            <>
              <div className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                <LayoutGrid className="w-3 h-3" />
                <span>{t('dashboardEditor.dragHint')}</span>
              </div>
              <ResponsiveGridLayout
                className="layout"
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={40}
                margin={[8, 8]}
                compactType="vertical"
                isDraggable
                isResizable
                onLayoutChange={handleLayoutChange}
                draggableHandle=".rgl-drag-handle"
              >
                {currentLayout.cards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg border border-border/80 bg-card/60 overflow-hidden flex flex-col"
                  >
                    <div className="rgl-drag-handle flex items-center justify-between px-2 py-1 bg-muted/40 border-b border-border/60 cursor-grab active:cursor-grabbing">
                      <span className="text-[10px] font-semibold text-foreground truncate">
                        {card.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCard(card.id)}
                        aria-label={t('dashboardEditor.removeCard')}
                        className="text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded p-0.5 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-2">
                      <div className="text-[10px] text-muted-foreground font-mono text-center">
                        <div className="font-semibold text-foreground/70">{card.type}</div>
                        <div className="mt-0.5">
                          {card.layout.w}×{card.layout.h}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </ResponsiveGridLayout>
            </>
          )}
        </CardContent>
      </Card>

      {/* Active Layout Cards List (compact reference) */}
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
