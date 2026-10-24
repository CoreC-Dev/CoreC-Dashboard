import { useCallback, useState } from 'react'

import { useCoreCWebSocket, type WSStatus } from '@/api/hooks'

/**
 * Shared live-chart stream scaffolding: the
 * status-mirror state, the append-to-rolling-window data flow, and the
 * disconnect-once (chart-freeze) semantics are the same pattern in
 * TrafficChart and MemoryChart. One hook owns the pattern; each chart
 * keeps only its domain logic (which frames fields map to which lines).
 *
 * Rationale for the chart-local status mirror: the chart freezes
 * honestly when its socket drops — data may render, but it is
 * stale. downOnce mirrors wsStatusStore's semantics: once the socket
 * involuntarily left 'open', the chart is paused until it reopens.
 * The store wiring itself lives inside useCoreCWebSocket.
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
