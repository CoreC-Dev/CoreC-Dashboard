import { useCallback, useState } from 'react'

import { useCoreCWebSocket, type WSStatus } from '@/api/hooks'

/**
 * Shared live-chart stream scaffolding (quality audit D2, batch F): the
 * status-mirror state, the append-to-rolling-window data flow, and the
 * B20 disconnect-once semantics were duplicated byte-for-byte between
 * TrafficChart and MemoryChart. One hook now owns the pattern; each chart
 * keeps only its domain logic (which frames fields map to which lines).
 *
 * B20 rationale (kept): the chart-local status mirror exists so the chart
 * freezes honestly when its socket drops — data may render, but it is
 * stale. downOnce mirrors wsStatusStore's semantics: once the socket
 * involuntarily left 'open', the chart is paused until it reopens.
 * The B01 store wiring inside useCoreCWebSocket is untouched.
 */
export function useLiveChartStream<TFrame, TPoint>(
  path: string,
  toPoint: (frame: TFrame, timeStr: string) => TPoint,
  maxPoints = 25,
) {
  const [data, setData] = useState<TPoint[]>([])
  const [status, setStatus] = useState<WSStatus>('connecting')
  const [downOnce, setDownOnce] = useState(false)

  const onMessage = useCallback(
    (frame: TFrame) => {
      const timeStr = new Date().toLocaleTimeString()
      setData((prev) => {
        const next = [...prev, toPoint(frame, timeStr)]
        if (next.length > maxPoints) next.shift()
        return next
      })
    },
    [toPoint, maxPoints],
  )

  const onStatus = useCallback((s: WSStatus) => {
    setStatus(s)
    setDownOnce((prev) => (s === 'open' ? false : s === 'connecting' ? prev : true))
  }, [])

  useCoreCWebSocket<TFrame>(path, { interval: '1s' }, onMessage, onStatus)

  const disconnected = downOnce && status !== 'open'
  return { data, status, disconnected }
}
