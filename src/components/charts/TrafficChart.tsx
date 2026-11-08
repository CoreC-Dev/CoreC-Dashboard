import { Pause, Play } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartLegend } from '@/components/charts/ChartLegend'
import { ChartStatusOverlay } from '@/components/charts/ChartStatusOverlay'
import { useLiveChartStream } from '@/hooks/useLiveChartStream'
import type { TrafficFrame } from '@/types/models'

/**
 * Traffic rate chart.
 *
 * The /traffic stream pushes server-side diffed
 * rates (`read_rate/publish_rate/dropped_rate`), so the chart appends
 * frames directly — no client baseline dance, no negative spike on
 * restart-to-zero, and the first frame already carries the engine's
 * 60s windowed rate instead of dead air.
 */
// memo'd so a parent re-render (e.g. DashboardPage polling useStats) doesn't
// re-render this chart unless its (empty) props change. The chart drives its
// own updates via the /traffic WebSocket, so it has nothing to gain from a
// parent re-render.
export const TrafficChart = memo(function TrafficChart() {
  const { t } = useTranslation()

  // Shared live-stream scaffolding: status mirror + rolling window +
  // disconnect-once (chart-freeze) semantics live in the hook; this chart
  // keeps only the rate-frame → point mapping.
  const { data, disconnected } = useLiveChartStream<
    TrafficFrame,
    { time: string; read: number; publish: number; dropped: number }
  >('/traffic', (frame, timeStr) => ({
    time: timeStr,
    read: frame.read_rate ?? 0,
    publish: frame.publish_rate ?? 0,
    dropped: frame.dropped_rate ?? 0,
  }))

  const last = data.length > 0 ? data[data.length - 1] : null
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<typeof data | null>(null)
  // Freeze the rendered window on demand — a live trace that keeps moving
  // while the operator lines up a cursor is hard to read.
  const shown = paused ? (frozen ?? data) : data
  const shownLast = shown.length > 0 ? shown[shown.length - 1] : last

  return (
    <>
      <ChartLegend
        items={[
          {
            label: t('dashboard.readPerSec'),
            color: 'hsl(var(--chart-1))',
            value: shownLast ? Math.round(shownLast.read) : undefined,
          },
          {
            label: t('dashboard.publishPerSec'),
            color: 'hsl(var(--chart-2))',
            value: shownLast ? Math.round(shownLast.publish) : undefined,
          },
        ]}
        action={
          <button
            type="button"
            onClick={() => {
              if (paused) {
                setPaused(false)
                setFrozen(null)
              } else {
                setFrozen(data)
                setPaused(true)
              }
            }}
            aria-label={paused ? t('dashboard.resume') : t('dashboard.pause')}
            aria-pressed={paused}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>
        }
      />
      <div className="relative w-full h-56 pt-2 [&_*]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={shown} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="pubGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="4 6"
              stroke="hsl(var(--border))"
              opacity={0.8}
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={28}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={40}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              cursor={{
                stroke: 'hsl(var(--muted-foreground) / 0.35)',
                strokeDasharray: '4 4',
              }}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderColor: 'hsl(var(--border))',
                borderRadius: '12px',
                boxShadow: 'var(--shadow-panel)',
                fontSize: '12px',
                padding: '8px 10px',
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}
              itemStyle={{ padding: 0 }}
            />
            <Area
              type="monotone"
              dataKey="read"
              name={t('dashboard.readPerSec')}
              stroke="hsl(var(--chart-1))"
              fillOpacity={1}
              fill="url(#readGrad)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="publish"
              name={t('dashboard.publishPerSec')}
              stroke="hsl(var(--chart-2))"
              fillOpacity={1}
              fill="url(#pubGrad)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        {/* "waiting for data" on first load, "updates paused" after a
         * drop — instead of silent empty axes / a silent freeze. */}
        <ChartStatusOverlay disconnected={disconnected} empty={shown.length === 0} />
      </div>
    </>
  )
})
