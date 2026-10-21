import { Activity, Cpu } from 'lucide-react'
import type React from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCoreCWebSocket, type WSStatus } from '@/api/hooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/utils'
import {
  type MemoryFrameMessage,
  memoryFrameSchema,
  type TrafficTotalsFrame,
  trafficFrameSchema,
} from '@/types/api'

/** Push cadence of both streams — same as the Dashboard charts. */
const WS_INTERVAL = '1s'

/** Colored connection dot + label for one stream's WSStatus. */
const statusDotClass = (status: WSStatus): string => {
  switch (status) {
    case 'open':
      return 'bg-status-running'
    case 'connecting':
      return 'bg-status-warning animate-pulse'
    default: // closed / error / rejected
      return 'bg-status-error'
  }
}

/** Reuses the /logs terminal's stream status vocabulary (diagnostics.stream*). */
const statusLabelKey = (status: WSStatus) => {
  switch (status) {
    case 'open':
      return 'diagnostics.streamConnected'
    case 'connecting':
      return 'diagnostics.streamConnecting'
    case 'closed':
      return 'diagnostics.streamClosed'
    case 'error':
      return 'diagnostics.streamError'
    case 'rejected':
      return 'diagnostics.streamRejected'
  }
}

const StatusBadge: React.FC<{ status: WSStatus }> = ({ status }) => {
  const { t } = useTranslation()
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(status)}`} />
      <span className="truncate">{t(statusLabelKey(status))}</span>
    </span>
  )
}

/** One compact stat tile — label over a mono value. */
const StatTile: React.FC<{ label: string; value: string; accent?: string }> = ({
  label,
  value,
  accent = 'text-foreground',
}) => (
  <div className="min-w-0 p-2 rounded-lg bg-muted/40 border border-border text-center">
    <div className="text-[10px] text-muted-foreground uppercase font-semibold truncate">
      {label}
    </div>
    <div className={`text-base font-bold font-mono truncate mt-0.5 ${accent}`}>{value}</div>
  </div>
)

/**
 * Live /traffic column — per-second rates straight off the wire.
 *
 * The backend's default mode pushes server-side diffed rate frames
 * (read_rate/publish_rate/dropped_rate; backend roadmap #32) — the first
 * frame already carries the engine's 60s windowed rate, so this renders
 * immediately with no client-side baseline. Legacy totals frames
 * (?mode=totals, cumulative counters) still render via client diff —
 * both shapes validate against the discriminated union schema.
 */
const TrafficLiveColumn: React.FC = () => {
  const { t } = useTranslation()
  const [rates, setRates] = useState<{ read: number; publish: number; dropped: number } | null>(
    null,
  )
  const [status, setStatus] = useState<WSStatus>('connecting')
  const prevTotalsRef = useRef<TrafficTotalsFrame | null>(null)

  useCoreCWebSocket<unknown>(
    '/traffic',
    { interval: WS_INTERVAL },
    (frame) => {
      // Boundary validation (AGENTS.md): a malformed push is dropped, never
      // rendered — the panel keeps the last good rates instead.
      const parsed = trafficFrameSchema.safeParse(frame)
      if (!parsed.success) return
      if ('read_rate' in parsed.data) {
        // Rate frame (default mode): render directly.
        prevTotalsRef.current = null
        setRates({
          read: parsed.data.read_rate,
          publish: parsed.data.publish_rate,
          dropped: parsed.data.dropped_rate,
        })
        return
      }
      // Totals frame (legacy mode): diff against the previous frame.
      const prev = prevTotalsRef.current
      prevTotalsRef.current = parsed.data
      if (!prev) return // first frame: baseline only, no rate yet
      const delta = (cur: number, old: number) => (cur >= old ? cur - old : cur)
      setRates({
        read: delta(parsed.data.read, prev.read),
        publish: delta(parsed.data.publish, prev.publish),
        dropped: delta(parsed.data.dropped, prev.dropped),
      })
    },
    setStatus,
  )

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
          {t('diagnostics.liveTraffic')}
        </span>
        <StatusBadge status={status} />
      </div>
      {rates === null ? (
        <div className="text-xs text-muted-foreground py-3 text-center">
          {t('diagnostics.liveWaiting')}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label={t('diagnostics.readsPerSec')} value={formatNumber(rates.read)} />
          <StatTile
            label={t('diagnostics.publishesPerSec')}
            value={formatNumber(rates.publish)}
            accent="text-status-running"
          />
          <StatTile
            label={t('diagnostics.droppedPerSec')}
            value={formatNumber(rates.dropped)}
            accent={rates.dropped > 0 ? 'text-status-error' : 'text-foreground'}
          />
        </div>
      )}
    </div>
  )
}

/** Live /memory column — alloc/sys/goroutines as pushed (no derivation). */
const MemoryLiveColumn: React.FC = () => {
  const { t } = useTranslation()
  const [mem, setMem] = useState<MemoryFrameMessage | null>(null)
  const [status, setStatus] = useState<WSStatus>('connecting')

  useCoreCWebSocket<unknown>(
    '/memory',
    { interval: WS_INTERVAL },
    (frame) => {
      const parsed = memoryFrameSchema.safeParse(frame)
      if (!parsed.success) return
      setMem(parsed.data)
    },
    setStatus,
  )

  const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
          {t('diagnostics.liveMemory')}
        </span>
        <StatusBadge status={status} />
      </div>
      {mem === null ? (
        <div className="text-xs text-muted-foreground py-3 text-center">
          {t('diagnostics.liveWaiting')}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label={t('diagnostics.heapAllocated')} value={mb(mem.alloc)} />
          <StatTile label={t('diagnostics.sysMemory')} value={mb(mem.sys)} />
          <StatTile
            label={t('diagnostics.goroutines')}
            value={formatNumber(mem.goroutines)}
            accent="text-primary"
          />
        </div>
      )}
    </div>
  )
}

/**
 * RealtimeStreamsPanel — compact /traffic + /memory live tiles for the
 * Diagnostics page.
 *
 * Both streams are pushed by CoreC on a 1s ticker; traffic counters are
 * cumulative and diffed client-side into per-second rates, memory frames
 * are shown as-is (alloc / sys / goroutines). Deliberately restrained:
 * one card, two columns, no charts — the Prometheus metrics card below
 * remains the deep-dive surface. Sockets are created on mount and
 * destroyed on unmount by useCoreCWebSocket.
 */
export const RealtimeStreamsPanel: React.FC = () => {
  const { t } = useTranslation()
  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold">{t('diagnostics.liveStreams')}</CardTitle>
        <CardDescription className="text-xs">{t('diagnostics.liveStreamsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TrafficLiveColumn />
          <div className="md:border-l md:border-border md:pl-4">
            <MemoryLiveColumn />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
