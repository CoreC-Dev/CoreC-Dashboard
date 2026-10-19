import { memo, useState } from 'react'
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
import { useCoreCWebSocket, type WSStatus } from '@/api/hooks'
import { ChartStatusOverlay } from '@/components/charts/ChartStatusOverlay'
import type { MemoryFrame } from '@/types/models'

// memo'd so a parent re-render (e.g. DashboardPage polling useStats) doesn't
// re-render this chart unless its (empty) props change. The chart drives its
// own updates via the /memory WebSocket, so it has nothing to gain from a
// parent re-render.
export const MemoryChart = memo(function MemoryChart() {
  const { t } = useTranslation()
  const [data, setData] = useState<
    { time: string; allocMb: number; sysMb: number; goroutines: number }[]
  >([])

  // B20: chart-local status mirror — see TrafficChart for the rationale;
  // the B01 wsStatusStore wiring inside useCoreCWebSocket is untouched.
  const [status, setStatus] = useState<WSStatus>('connecting')
  const [downOnce, setDownOnce] = useState(false)

  useCoreCWebSocket<MemoryFrame>(
    '/memory',
    { interval: '1s' },
    (frame) => {
      const timeStr = new Date().toLocaleTimeString()
      setData((prev) => {
        const allocMb = Number((frame.alloc / (1024 * 1024)).toFixed(2))
        const sysMb = Number((frame.sys / (1024 * 1024)).toFixed(2))
        const next = [...prev, { time: timeStr, allocMb, sysMb, goroutines: frame.goroutines }]
        if (next.length > 25) next.shift()
        return next
      })
    },
    (s) => {
      setStatus(s)
      setDownOnce((prev) => (s === 'open' ? false : s === 'connecting' ? prev : true))
    },
  )
  const disconnected = downOnce && status !== 'open'

  return (
    <div className="relative w-full h-56 pt-2 [&_*]:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="time"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
          />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} unit="MB" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '13px',
            }}
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
      {/* B20: empty axes say "waiting", a silent freeze says "paused". */}
      <ChartStatusOverlay disconnected={disconnected} empty={data.length === 0} />
    </div>
  )
})
