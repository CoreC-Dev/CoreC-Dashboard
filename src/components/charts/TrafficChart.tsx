import { memo, useEffect, useRef, useState } from 'react'
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
import { CoreCWebSocket } from '@/api/websocket'
import type { TrafficFrame } from '@/types/models'

/**
 * Traffic rate chart.
 *
 * CoreC's `/traffic` WebSocket pushes CUMULATIVE monotonic counters
 * (`stats.TotalRead/TotalPublish/TotalDropped`), NOT per-second rates.
 * Labelling the raw cumulative values as "Read / s" (the original bug)
 * produced a misleading ever-rising line. We convert cumulative counters
 * to per-interval rates by diffing against the previous frame.
 *
 * The stream interval is 1s, so delta == reads/second. Counter resets
 * (server restart → counters drop back to 0) are handled: when current
 * < previous we treat the whole current value as the delta.
 */
// memo'd so a parent re-render (e.g. DashboardPage polling useStats) doesn't
// re-render this chart unless its (empty) props change. The chart drives its
// own updates via the /traffic WebSocket, so it has nothing to gain from a
// parent re-render.
export const TrafficChart = memo(function TrafficChart() {
  const { t } = useTranslation()
  const [data, setData] = useState<
    { time: string; read: number; publish: number; dropped: number }[]
  >([])
  const prevRef = useRef<TrafficFrame | null>(null)

  useEffect(() => {
    const ws = new CoreCWebSocket<TrafficFrame>('/traffic', { interval: '1s' }, (frame) => {
      const prev = prevRef.current
      prevRef.current = frame
      // First frame establishes the baseline; no rate to compute yet.
      if (!prev) return

      const delta = (cur: number, old: number) => (cur >= old ? cur - old : cur)
      const timeStr = new Date().toLocaleTimeString()
      setData((old) => {
        const next = [
          ...old,
          {
            time: timeStr,
            read: delta(frame.read, prev.read),
            publish: delta(frame.publish, prev.publish),
            dropped: delta(frame.dropped, prev.dropped),
          },
        ]
        if (next.length > 25) next.shift() // keep last 25 points
        return next
      })
    })

    return () => ws.destroy()
  }, [])

  return (
    <div className="w-full h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="time"
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            tickLine={false}
          />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '11px',
            }}
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
    </div>
  )
})
