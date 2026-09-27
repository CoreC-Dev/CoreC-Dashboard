import { Check, LayoutGrid, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { CardType } from '@/types/dashboard'

const CARD_TYPES: {
  type: CardType
  title: string
  desc: string
  defaultH: number
  defaultW: number
}[] = [
  {
    type: 'kpi-summary',
    title: 'KPI Metrics Row',
    desc: 'Uptime, Sample Rate, Connected Drivers/Transports, Dropped count',
    defaultW: 12,
    defaultH: 3,
  },
  {
    type: 'traffic-chart',
    title: 'Traffic Throughput Chart',
    desc: 'Realtime Read vs Publish vs Dropped curves from /traffic WebSocket',
    defaultW: 6,
    defaultH: 5,
  },
  {
    type: 'memory-chart',
    title: 'Memory & Goroutines Chart',
    desc: 'Zero-STW runtime heap and system memory from /memory WebSocket',
    defaultW: 6,
    defaultH: 5,
  },
  {
    type: 'driver-status-list',
    title: 'Southbound Drivers Matrix',
    desc: 'Modbus, S7, OPC UA online states and polling counters',
    defaultW: 6,
    defaultH: 6,
  },
  {
    type: 'transport-status-list',
    title: 'Northbound Transports Matrix',
    desc: 'MQTT, HTTP push channels, publication count and queue sizes',
    defaultW: 6,
    defaultH: 6,
  },
  {
    type: 'recent-alerts',
    title: 'Alerts & Dead Letter Queue',
    desc: 'Alarm triggered points and exhausted write attempts',
    defaultW: 12,
    defaultH: 4,
  },
]

export const DashboardEditorPage: React.FC = () => {
  const { currentLayout, addCard, removeCard, resetToDefault } = useDashboardStore()
  const [savedNotice, setSavedNotice] = useState(false)

  const handleAdd = (item: (typeof CARD_TYPES)[0]) => {
    addCard({
      type: item.type,
      title: item.title,
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
    setTimeout(() => setSavedNotice(false), 2500)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Large-Screen Layout Editor</h1>
          <p className="text-xs text-muted-foreground">
            Configure, reorder, add and remove cards for the plant-floor monitor dashboard
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            <span>Reset Default</span>
          </Button>

          <Button size="sm" onClick={handleSave} className="h-8 text-xs glow-primary font-semibold">
            {savedNotice ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                <span>Saved to Local Storage!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1" />
                <span>Save Layout</span>
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
            <span>Available Card Catalog</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Click to append a card component to the active dashboard layout
          </CardDescription>
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
                    {item.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {item.desc}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {item.defaultW}x{item.defaultH} grid
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAdd(item)}
                    className="h-7 px-2 text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    <span>Add</span>
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
            <span>Active Layout Cards ({currentLayout.cards.length})</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Ordered list of components rendered on /monitor/dashboard
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 pt-1 space-y-2">
          {currentLayout.cards.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border-dashed border rounded-lg">
              No cards in layout. Add one from the catalog above.
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
                      type: {card.type} • span: {card.layout.w} cols x {card.layout.h} rows
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCard(card.id)}
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
