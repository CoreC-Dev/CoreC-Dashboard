import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Cpu,
  Database,
  RefreshCw,
  Send,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useDeadLetters, useDrivers, useStats, useTransports } from '@/api/hooks'
import { MemoryChart } from '@/components/charts/MemoryChart'
import { TrafficChart } from '@/components/charts/TrafficChart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountUpNumber } from '@/components/ui/count-up-number'
import { LoadingState } from '@/components/ui/loading-state'
import { DashboardDeadLetterCard } from '@/features/monitor/DashboardDeadLetterCard'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber, formatUptime } from '@/lib/utils'

/**
 * Monitor dashboard — fixed 5-row layout per ARCHITECTURE_RESTRUCTURE.md.
 *
 * Row 1: KPI indicators (6 small cards: status, uptime, reads, publishes, dropped, pts/sec)
 * Row 2: Real-time charts (traffic + memory, side by side)
 * Row 3: Driver matrix (compact cards)
 * Row 4: Transport matrix (compact cards)
 * Row 5: Dead letters (failed writes) + current error-event count (B03)
 *
 * No customizable layout — fixed design for out-of-the-box best experience.
 *
 * Degradation contract (B04): a failed stats poll keeps the last good
 * snapshot rendered with a stale-data banner + manual retry; only a
 * first-load failure with NO data falls back to the full-page error.
 */
export const DashboardPage: React.FC = () => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    // Timestamp of the last SUCCESSFUL stats fetch — the "snapshot from
    // {{time}}" the stale-data banner shows (B04).
    dataUpdatedAt: statsUpdatedAt,
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useStats()
  const { data: driversData } = useDrivers()
  const { data: transportsData } = useTransports()
  const { data: deadLettersData } = useDeadLetters()

  const drivers = useMemo(() => driversData?.drivers || [], [driversData])
  const transports = useMemo(() => transportsData?.transports || [], [transportsData])
  const deadLetters = useMemo(() => deadLettersData?.failed_writes || [], [deadLettersData])

  const connectedDrivers = useMemo(() => drivers.filter((d) => d.state === 2).length, [drivers])
  const connectedTransports = useMemo(
    () => transports.filter((tr) => tr.state === 2).length,
    [transports],
  )

  // B05 — online-ratio coloring: 100% green, 1–99% amber, 0% red. The old
  // hardcoded `text-status-running` kept "0% online" green, so a full
  // driver/transport outage was invisible during a night-shift page scan.
  // With no drivers/transports configured the honest color is muted "N/A",
  // not a green percentage.
  const ONLINE_TONE_CLASS = {
    full: 'text-status-running',
    partial: 'text-status-warning',
    none: 'text-status-error',
  } as const
  const onlineToneOf = (connected: number, total: number): keyof typeof ONLINE_TONE_CLASS =>
    connected === total ? 'full' : connected === 0 ? 'none' : 'partial'
  const driverTone = drivers.length > 0 ? onlineToneOf(connectedDrivers, drivers.length) : null
  const transportTone =
    transports.length > 0 ? onlineToneOf(connectedTransports, transports.length) : null
  const ratioPercent = (connected: number, total: number): number =>
    Math.round((connected / total) * 100)
  const driverToneClass = driverTone ? ONLINE_TONE_CLASS[driverTone] : 'text-muted-foreground'
  const transportToneClass = transportTone
    ? ONLINE_TONE_CLASS[transportTone]
    : 'text-muted-foreground'
  const driverStatusLabel =
    driverTone === 'full'
      ? t('dashboard.onlineFull')
      : driverTone === 'partial'
        ? t('dashboard.onlinePercent', { n: ratioPercent(connectedDrivers, drivers.length) })
        : driverTone === 'none'
          ? t('dashboard.allOffline')
          : t('dashboard.notAvailable', { defaultValue: 'N/A' })
  const transportStatusLabel =
    transportTone === 'full'
      ? t('dashboard.connectedFull')
      : transportTone === 'partial'
        ? t('dashboard.connectedPercent', {
            n: ratioPercent(connectedTransports, transports.length),
          })
        : transportTone === 'none'
          ? t('dashboard.allDisconnected')
          : t('dashboard.notAvailable', { defaultValue: 'N/A' })

  // Engine status dot — reflect the actual stats.status instead of a hardcoded
  // green. "running"/"ok" (and the loading state with no status yet) are
  // healthy (green); error-like states are red; anything else is amber.
  const statusLower = stats?.status?.toLowerCase() ?? ''
  const isStatusHealthy = statusLower === '' || statusLower === 'running' || statusLower === 'ok'
  const isStatusError =
    statusLower.includes('error') ||
    statusLower.includes('fatal') ||
    statusLower === 'stopped' ||
    statusLower === 'down' ||
    statusLower === 'crashed'
  const statusDotClass = isStatusHealthy
    ? 'bg-status-running glow-running'
    : isStatusError
      ? 'bg-status-error'
      : 'bg-status-warning'

  const adminBase = id ? `/corec/${id}/admin` : '/admin'
  const alertsLink = id ? `/corec/${id}/monitor/alerts` : '/monitor/alerts'

  // Loading skeleton — shown while the initial stats fetch is in flight.
  if (statsLoading) {
    return <LoadingState className="py-24" />
  }

  // Error fallback — only when the FIRST load fails and there is no data to
  // show at all (B04). A failed background poll no longer collapses the whole
  // page: the last good snapshot stays rendered and the banner below tells
  // the operator exactly how old it is, with a manual retry that doesn't wait
  // for the 5s poll to recover on its own.
  const statsStale = statsError && !!stats
  if (statsError && !stats) {
    return (
      <div className="flex items-center justify-center py-24 text-status-error">
        <AlertCircle className="w-6 h-6 mr-3" />
        <span className="text-base">
          {t('dashboard.loadFailed', { defaultValue: 'Failed to load dashboard data' })}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('nav.dashboard')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('dashboard.realtimeMonitor', { defaultValue: 'Real-time monitoring & control' })}
        </p>
      </div>

      {/* Stale-snapshot banner (B04) — a failed refresh keeps the rendered
       *  data and says so, instead of collapsing the page into one red line.
       *  Auto-dismisses when the next poll succeeds. */}
      {statsStale && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-2.5 text-sm text-status-warning"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" aria-hidden />
          <span className="min-w-0">
            {t('dashboard.refreshFailed', {
              time: new Date(statsUpdatedAt).toLocaleTimeString(),
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchStats()
            }}
            disabled={statsFetching}
            className="ml-auto h-7 shrink-0 border-status-warning/40 px-2.5 text-xs text-status-warning hover:bg-status-warning/10 hover:text-status-warning"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${statsFetching ? 'animate-spin' : ''}`}
              aria-hidden
            />
            <span>{t('common.retry')}</span>
          </Button>
        </div>
      )}

      {/* Row 1 — KPI indicators */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 card-stagger">
        {/* Engine Status */}
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 card-hover card-enter">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>{t('dashboard.engineStatus')}</span>
            <Activity className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${statusDotClass}`} />
            <span className="text-base font-bold capitalize">
              {stats?.status || t('common.running')}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>{formatUptime(stats?.uptime || 0)}</span>
          </div>
        </div>
        {/* Sample Rate */}
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 card-hover card-enter">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>{t('dashboard.sampleRate')}</span>
            <TrendingUp className="w-3.5 h-3.5 text-status-running" />
          </div>
          <div className="text-lg font-bold font-mono tnum truncate">
            <CountUpNumber
              value={stats?.points_per_sec ?? 0}
              duration={600}
              format={(n) => n.toFixed(1)}
            />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t('dashboard.pointsPerSecond', { defaultValue: 'points / second' })}
          </div>
        </div>
        {/* Drivers */}
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 card-hover card-enter">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>{t('dashboard.drivers')}</span>
            <Cpu className="w-3.5 h-3.5 text-status-queued" />
          </div>
          <div className="text-lg font-bold font-mono tnum truncate">
            <CountUpNumber value={connectedDrivers} duration={600} />{' '}
            <span className="text-xs text-muted-foreground font-normal">/ {drivers.length}</span>
          </div>
          <div className={`text-xs mt-0.5 ${driverToneClass}`}>{driverStatusLabel}</div>
        </div>
        {/* Transports */}
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 card-hover card-enter">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>{t('dashboard.sinks')}</span>
            <Send className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-lg font-bold font-mono tnum truncate">
            <CountUpNumber value={connectedTransports} duration={600} />{' '}
            <span className="text-xs text-muted-foreground font-normal">/ {transports.length}</span>
          </div>
          <div className={`text-xs mt-0.5 ${transportToneClass}`}>{transportStatusLabel}</div>
        </div>
        {/* Total Read */}
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 card-hover card-enter">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>{t('dashboard.totalRead')}</span>
            <Database className="w-3.5 h-3.5 text-status-warning" />
          </div>
          <div className="text-lg font-bold font-mono tnum truncate">
            {/* B12: integer counters keep rounding INSIDE their format — the
             * raw animated value is fractional mid-flight, and formatNumber
             * itself does not round. */}
            <CountUpNumber
              value={stats?.total_read ?? 0}
              duration={800}
              format={(n) => formatNumber(Math.round(n))}
            />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t('dashboard.pub', { defaultValue: 'Pub' })}: {formatNumber(stats?.total_publish || 0)}
          </div>
        </div>
        {/* Dropped */}
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-3 card-hover card-enter">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>{t('dashboard.dropped')}</span>
            <TrendingDown className="w-3.5 h-3.5 text-status-error" />
          </div>
          <div className="text-lg font-bold font-mono tnum truncate text-status-error">
            {/* B12: integer counter — round inside the format (see Total Read). */}
            <CountUpNumber
              value={stats?.total_dropped ?? 0}
              duration={800}
              format={(n) => formatNumber(Math.round(n))}
            />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t('dashboard.errors', { defaultValue: 'Errors' })}: {stats?.total_errors || 0}
          </div>
        </div>
      </div>

      {/* Row 2 — Real-time charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 card-stagger">
        <Card className="border-border bg-card card-enter">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">{t('dashboard.trafficChart')}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <TrafficChart />
          </CardContent>
        </Card>
        <Card className="border-border bg-card card-enter">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">{t('dashboard.memoryChart')}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <MemoryChart />
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Driver matrix */}
      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">{t('dashboard.driverList')}</CardTitle>
          <Link
            to={`${adminBase}/drivers`}
            className="text-xs text-primary hover:underline flex items-center space-x-0.5"
          >
            <span>{t('dashboard.manage', { defaultValue: 'Manage' })}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {drivers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {t('dashboard.noDrivers', { defaultValue: 'No drivers configured' })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
              {drivers.map((drv) => {
                const st = ConnStateLabel[drv.state] || ConnStateLabel[0]
                return (
                  <div
                    key={drv.name}
                    className="min-w-0 overflow-hidden p-2.5 rounded-lg border border-border bg-card text-sm"
                  >
                    <div className="flex items-center space-x-2 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${st.dotColor}`} />
                      <span className="font-semibold truncate">{drv.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{drv.type}</div>
                    <div className="flex items-center justify-between mt-1.5 text-xs">
                      <span className="text-muted-foreground">
                        R:{formatNumber(drv.read_count)}
                      </span>
                      <span className="text-status-error">E:{drv.error_count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 4 — Transport matrix */}
      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">{t('dashboard.transportList')}</CardTitle>
          <Link
            to={`${adminBase}/transports`}
            className="text-xs text-primary hover:underline flex items-center space-x-0.5"
          >
            <span>{t('dashboard.manage', { defaultValue: 'Manage' })}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {transports.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {t('dashboard.noTransports', { defaultValue: 'No transports configured' })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
              {transports.map((tr) => {
                const st = ConnStateLabel[tr.state] || ConnStateLabel[0]
                return (
                  <div
                    key={tr.name}
                    className="min-w-0 overflow-hidden p-2.5 rounded-lg border border-border bg-card text-sm"
                  >
                    <div className="flex items-center space-x-2 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${st.dotColor}`} />
                      <span className="font-semibold truncate">{tr.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{tr.type}</div>
                    <div className="flex items-center justify-between mt-1.5 text-xs">
                      <span className="text-muted-foreground">P:{formatNumber(tr.published)}</span>
                      <span className="text-status-warning">Q:{tr.queue_size}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 5 — Dead letters (failed writes) + current error-event lure (B03) */}
      <DashboardDeadLetterCard deadLetters={deadLetters} alertsLink={alertsLink} />
    </div>
  )
}
