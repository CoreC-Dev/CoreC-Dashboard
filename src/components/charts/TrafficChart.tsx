import type React from 'react'
import { useEffect, useState } from 'react'
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

export const TrafficChart: React.FC = () => {
  const [data, setData] = useState<
    { time: string; read: number; publish: number; dropped: number }[]
  >([])

  useEffect(() => {
    const ws = new CoreCWebSocket<TrafficFrame>('/traffic', { interval: '1s' }, (frame) => {
      const timeStr = new Date().toLocaleTimeString()
      setData((prev) => {
        const next = [
          ...prev,
          { time: timeStr, read: frame.read, publish: frame.publish, dropped: frame.dropped },
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
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="pubGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
            name="Read / s"
            stroke="#3b82f6"
            fillOpacity={1}
            fill="url(#readGrad)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="publish"
            name="Publish / s"
            stroke="#10b981"
            fillOpacity={1}
            fill="url(#pubGrad)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
