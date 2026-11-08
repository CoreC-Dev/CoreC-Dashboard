import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartStatusOverlay } from '@/components/charts/ChartStatusOverlay'
import { useLiveChartStream } from '@/hooks/useLiveChartStream'
import type { MemoryFrame } from '@/types/models'

// memo'd so a parent re-render (e.g. DashboardPage polling useStats) doesn't
// re-render this chart unless its (empty) props change. The chart drives its
// own updates via the /memory WebSocket, so it has nothing to gain from a
// parent re-render.
export const MemoryChart = memo(function MemoryChart() {
  const { t } = useTranslation()

  // Shared live-stream scaffolding: status mirror + rolling window +
  // disconnect-once (chart-freeze) semantics live in the hook; this chart
  // keeps only the memory-frame → point mapping.
  const { data, disconnected } = useLiveChartStream<
    MemoryFrame,
    { time: string; allocMb: number; sysMb: number; goroutines: number }
  >('/memory', (frame, timeStr) => ({
    time: timeStr,
    allocMb: Number((frame.alloc / (1024 * 1024)).toFixed(2)),
    sysMb: Number((frame.sys / (1024 * 1024)).toFixed(2)),
    goroutines: frame.goroutines,
  }))

  return (
    <div className="relative w-full h-56 pt-2 [&_*]:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
            width={48}
            unit="MB"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.35)', strokeDasharray: '4 4' }}
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
          <Line
            type="monotone"
            dataKey="allocMb"
            name={t('dashboard.heapAllocMb')}
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="sysMb"
            name={t('dashboard.sysMemMb')}
            stroke="hsl(var(--chart-2))"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {/* Empty axes say "waiting", a silent freeze says "paused". */}
      <ChartStatusOverlay disconnected={disconnected} empty={data.length === 0} />
    </div>
  )
})
