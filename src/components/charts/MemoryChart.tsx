import type React from 'react'
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CoreCWebSocket } from '@/api/websocket'
import type { MemoryFrame } from '@/types/models'

export const MemoryChart: React.FC = () => {
  const [data, setData] = useState<
    { time: string; allocMb: number; sysMb: number; goroutines: number }[]
  >([])

  useEffect(() => {
    const ws = new CoreCWebSocket<MemoryFrame>('/memory', { interval: '1s' }, (frame) => {
      const timeStr = new Date().toLocaleTimeString()
      setData((prev) => {
        const allocMb = Number((frame.alloc / (1024 * 1024)).toFixed(2))
        const sysMb = Number((frame.sys / (1024 * 1024)).toFixed(2))
        const next = [...prev, { time: timeStr, allocMb, sysMb, goroutines: frame.goroutines }]
        if (next.length > 25) next.shift()
        return next
      })
    })

    return () => ws.destroy()
  }, [])

  return (
    <div className="w-full h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="time"
            stroke="hsl(var(--muted-foreground))"
            fontSize={10}
            tickLine={false}
          />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} unit="MB" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '11px',
            }}
          />
          <Line
            type="monotone"
            dataKey="allocMb"
            name="Heap Alloc (MB)"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="sysMb"
            name="Sys Mem (MB)"
            stroke="#06b6d4"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
