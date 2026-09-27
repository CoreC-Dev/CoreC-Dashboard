import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Inbox,
  Layers,
  RefreshCw,
  Send,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useTransport } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'

// CoreC emits Go's zero time (0001-01-01T00:00:00Z) for unset timestamps.
const isZeroTime = (ts: string) => !ts || ts.startsWith('0001-01-01')

const formatTimestamp = (ts: string): string => {
  if (isZeroTime(ts)) return 'Never'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
}

const BackLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Button
    asChild
    variant="ghost"
    size="sm"
    className="h-8 -ml-2 text-xs text-muted-foreground hover:text-foreground"
  >
    <Link to={to}>
      <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
      {children}
    </Link>
  </Button>
)

const StatCard: React.FC<{
  label: string
  value: string
  icon: React.ReactNode
  accent: string
}> = ({ label, value, icon, accent }) => (
  <Card className="bg-card/60">
    <CardContent className="flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-lg font-bold leading-tight">{value}</div>
      </div>
    </CardContent>
  </Card>
)

const Param: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 space-y-1">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="break-all text-xs font-medium text-foreground">{children}</div>
  </div>
)

export const TransportDetailPage: React.FC = () => {
  const { t } = useTranslation()
  const { name } = useParams<{ name: string }>()
  const { data: transport, isLoading, error, refetch, isFetching } = useTransport(name ?? '')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <BackLink to="/admin/transports">
          {t('transports.transportList', { defaultValue: 'Back to Transports' })}
        </BackLink>
        <div className="py-16 text-center text-xs text-muted-foreground">
          {t('common.loading', { defaultValue: 'Loading transport...' })}
        </div>
      </div>
    )
  }

  if (error || !transport) {
    return (
      <div className="space-y-6">
        <BackLink to="/admin/transports">
          {t('transports.transportList', { defaultValue: 'Back to Transports' })}
        </BackLink>
        <Card className="border-dashed bg-card/40">
          <CardContent className="space-y-2 p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <div className="text-sm font-semibold">{t('transports.detailNotFound')}</div>
            <div className="text-xs text-muted-foreground">
              {name
                ? `No transport named "${name}" is registered on this CoreC instance.`
                : 'No transport name was provided in the URL.'}
            </div>
            {error instanceof Error && error.message && (
              <div className="break-all font-mono text-[11px] text-rose-400/80">
                {error.message}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const st = ConnStateLabel[transport.state] ?? ConnStateLabel[0]
  const queuePct = Math.min(100, transport.queue_size)
  const queueActive = transport.queue_size > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink to="/admin/transports">
          {t('transports.transportList', { defaultValue: 'Back to Transports' })}
        </BackLink>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 shrink-0 text-xs"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </Button>
      </div>

      {/* Header */}
      <Card className="bg-card/60">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">{transport.name}</CardTitle>
              <CardDescription className="font-mono text-[11px]">{transport.type}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
            {t(st.key)}
          </Badge>
        </CardHeader>
      </Card>

      {/* Publishing stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Published"
          value={formatNumber(transport.published)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          accent="border border-emerald-500/20 bg-emerald-500/10"
        />
        <StatCard
          label="Failed"
          value={formatNumber(transport.failed)}
          icon={<XCircle className="h-5 w-5 text-rose-400" />}
          accent="border border-rose-500/20 bg-rose-500/10"
        />
        <StatCard
          label="Received"
          value={formatNumber(transport.received)}
          icon={<Inbox className="h-5 w-5 text-sky-400" />}
          accent="border border-sky-500/20 bg-sky-500/10"
        />
        <StatCard
          label="Dropped Commands"
          value={formatNumber(transport.dropped_commands)}
          icon={<Archive className="h-5 w-5 text-amber-400" />}
          accent="border border-amber-500/20 bg-amber-500/10"
        />
      </div>

      {/* Queue depth indicator */}
      <Card className={`bg-card/60 ${queueActive ? 'border-amber-500/40' : ''}`}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Queue Depth
            </span>
            {queueActive ? (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-400"
              >
                Backpressure
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              >
                Drained
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Pending commands buffered in the northbound publish queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Queue Size
            </span>
            <span
              className={`font-mono text-xl font-bold ${queueActive ? 'text-amber-400' : 'text-foreground'}`}
            >
              {formatNumber(transport.queue_size)}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                queueActive ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${queuePct}%` }}
            />
          </div>
          {queueActive && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px]">
                {formatNumber(transport.queue_size)} command(s) are queued and awaiting publish.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connection & publishing parameters */}
      <Card className="bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Send className="h-4 w-4 text-primary" />
            Connection &amp; Publishing Parameters
          </CardTitle>
          <CardDescription>
            Live northbound transport state and publish/command counters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
            <Param label="Transport Name">
              <span className="font-mono">{transport.name}</span>
            </Param>
            <Param label="Protocol Type">
              <span className="font-mono">{transport.type}</span>
            </Param>
            <Param label="Connection State">
              <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
                {t(st.key)}
              </Badge>
            </Param>
            <Param label="Published">
              <span className="font-mono text-emerald-400">
                {formatNumber(transport.published)}
              </span>
            </Param>
            <Param label="Failed">
              <span className={`font-mono ${transport.failed > 0 ? 'text-rose-400' : ''}`}>
                {formatNumber(transport.failed)}
              </span>
            </Param>
            <Param label="Received">
              <span className="font-mono text-sky-400">{formatNumber(transport.received)}</span>
            </Param>
            <Param label="Last Publish">
              <span className="font-mono">{formatTimestamp(transport.last_publish)}</span>
            </Param>
            <Param label="Queue Size">
              <span className={`font-mono ${queueActive ? 'text-amber-400' : ''}`}>
                {formatNumber(transport.queue_size)}
              </span>
            </Param>
            <Param label="Dropped Commands">
              <span
                className={`font-mono ${transport.dropped_commands > 0 ? 'text-amber-400' : ''}`}
              >
                {formatNumber(transport.dropped_commands)}
              </span>
            </Param>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
