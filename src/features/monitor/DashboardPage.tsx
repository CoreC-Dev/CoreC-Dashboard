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
import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useDeadLetters, useDrivers, useStats, useTransports } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountUpNumber } from '@/components/ui/count-up-number'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardDeadLetterCard } from '@/features/monitor/DashboardDeadLetterCard'
import i18n from '@/i18n'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber, formatUptime } from '@/lib/utils'

// The two live charts pull in recharts — by far the heaviest part of this
// route. Defer them so the KPI row paints first and the charts stream in.
const TrafficChart = lazy(() =>
  import('@/components/charts/TrafficChart').then((m) => ({ default: m.TrafficChart })),
)
const MemoryChart = lazy(() =>
  import('@/components/charts/MemoryChart').then((m) => ({ default: m.MemoryChart })),
)

/**
 * First-load placeholder that mirrors the real dashboard layout. A spinner
 * in the middle of an empty page tells the operator "something is loading";
 * this keeps the eventual card grid in place so the page settles instead of
 * jumping when the first stats snapshot lands.
 */
const DashboardSkeleton: React.FC = () => (
  <div
    className="space-y-6"
    role="status"
    aria-busy="true"
    aria-label={i18n.t('common.loading')}
  >
    <div className="space-y-2">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-4 w-64" />
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="rounded-3xl squircle border border-border bg-card p-4"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="mt-3.5 h-6 w-20" />
          <Skeleton className="mt-2.5 h-3 w-14" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Skeleton className="h-[292px] rounded-3xl" />
      <Skeleton className="h-[292px] rounded-3xl" />
    </div>
    <Skeleton className="h-44 rounded-3xl" />
  </div>
)

/**
 * Monitor dashboard — fixed 5-row layout per ARCHITECTURE_RESTRUCTURE.md.
 *
 * Row 1: KPI indicators (6 small cards: status, uptime, reads, publishes, dropped, pts/sec)
 * Row 2: Real-time charts (traffic + memory, side by side)
 * Row 3: Driver matrix (compact cards)
 * Row 4: Transport matrix (compact cards)
 * Row 5: Dead letters (failed writes) + current error-event count
 *
 * No customizable layout — fixed design for out-of-the-box best experience.
 *
 * Degradation contract: a failed stats poll keeps the last good
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
    // {{time}}" the stale-data banner shows.
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

  // Online-ratio coloring: 100% green, 1–99% amber, 0% red. The old
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
  // green. An ABSENT status is not "running" — rendering "don't know"
  // as a green dot was the audit's complaint. Only an actual running/ok
  // goes green; error-like states are red; anything else — including an
  // empty/missing status — is amber "Unknown" (common.unknown).
  const statusLower = stats?.status?.toLowerCase() ?? ''
  const isStatusHealthy = statusLower !== '' && (statusLower === 'running' || statusLower === 'ok')
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

  // Loading skeleton — mirrors the final layout so nothing shifts when the
  // first stats snapshot arrives.
  if (statsLoading) {
    return <DashboardSkeleton />
  }

  // Error fallback — only when the FIRST load fails and there is no data to
  // show at all. A failed background poll no longer collapses the whole
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
    <div className="space-y-6">
      {/* Page header — title on the left, live refresh on the right */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('nav.dashboard')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('dashboard.realtimeMonitor', { defaultValue: 'Real-time monitoring & control' })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void refetchStats()
          }}
          disabled={statsFetching}
          className="h-8 shrink-0 gap-1.5"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${statsFetching ? 'animate-spin' : ''}`}
            aria-hidden
          />
          <span>{t('common.refresh')}</span>
        </Button>
      </div>

      {/* Stale-snapshot banner — a failed refresh keeps the rendered
       * data and says so, instead of collapsing the page into one red line.
       * Auto-dismisses when the next poll succeeds. */}
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 card-stagger">
        {/* Engine Status */}
        <div className="min-w-0 overflow-hidden rounded-3xl squircle border border-border bg-card p-4 card-quiet card-enter">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('dashboard.engineStatus')}
            </span>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Activity className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass}`} />
            <span className="truncate text-[22px] font-semibold leading-none tracking-tight capitalize">
              {/* A missing status reads "Unknown" — never a green
               * "running" claim the server never made. */}
              {stats?.status || t('common.unknown')}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            <span className="tnum">{formatUptime(stats?.uptime || 0)}</span>
          </div>
        </div>
        {/* Sample Rate */}
        <div className="min-w-0 overflow-hidden rounded-3xl squircle border border-border bg-card p-4 card-quiet card-enter">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('dashboard.sampleRate')}
            </span>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-status-running/10 text-status-running">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-[22px] font-semibold leading-none tracking-tight tnum">
            <CountUpNumber
              value={stats?.points_per_sec ?? 0}
              duration={600}
              format={(n) => n.toFixed(1)}
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {t('dashboard.pointsPerSecond', { defaultValue: 'points / second' })}
          </div>
        </div>
        {/* Drivers */}
        <div className="min-w-0 overflow-hidden rounded-3xl squircle border border-border bg-card p-4 card-quiet card-enter">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('dashboard.drivers')}
            </span>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-status-queued/10 text-status-queued">
              <Cpu className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold leading-none tracking-tight tnum">
              <CountUpNumber value={connectedDrivers} duration={600} />
            </span>
            <span className="text-xs font-medium text-muted-foreground tnum">
              / {drivers.length}
            </span>
          </div>
          <div className={`mt-2 text-xs font-medium ${driverToneClass}`}>{driverStatusLabel}</div>
        </div>
        {/* Transports */}
        <div className="min-w-0 overflow-hidden rounded-3xl squircle border border-border bg-card p-4 card-quiet card-enter">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('dashboard.sinks')}
            </span>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Send className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold leading-none tracking-tight tnum">
              <CountUpNumber value={connectedTransports} duration={600} />
            </span>
            <span className="text-xs font-medium text-muted-foreground tnum">
              / {transports.length}
            </span>
          </div>
          <div className={`mt-2 text-xs font-medium ${transportToneClass}`}>
            {transportStatusLabel}
          </div>
        </div>
        {/* Total Read */}
        <div className="min-w-0 overflow-hidden rounded-3xl squircle border border-border bg-card p-4 card-quiet card-enter">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('dashboard.totalRead')}
            </span>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-status-warning/10 text-status-warning">
              <Database className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-[22px] font-semibold leading-none tracking-tight tnum">
            {/* Integer counters keep rounding INSIDE their format — the
             * raw animated value is fractional mid-flight, and formatNumber
             * itself does not round. */}
            <CountUpNumber
              value={stats?.total_read ?? 0}
              duration={800}
              format={(n) => formatNumber(Math.round(n))}
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground tnum">
            {t('dashboard.pub', { defaultValue: 'Pub' })}: {formatNumber(stats?.total_publish || 0)}
          </div>
        </div>
        {/* Dropped */}
        <div className="min-w-0 overflow-hidden rounded-3xl squircle border border-border bg-card p-4 card-quiet card-enter">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('dashboard.dropped')}
            </span>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-status-error/10 text-status-error">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-[22px] font-semibold leading-none tracking-tight tnum text-status-error">
            {/* Integer counter — round inside the format (see Total Read). */}
            <CountUpNumber
              value={stats?.total_dropped ?? 0}
              duration={800}
              format={(n) => formatNumber(Math.round(n))}
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground tnum">
            {t('dashboard.errors', { defaultValue: 'Errors' })}: {stats?.total_errors || 0}
          </div>
        </div>
      </div>

      {/* Row 2 — Real-time charts */}
      <div className="grid grid-cols-1 gap-4 card-stagger lg:grid-cols-2">
        <Card className="border-border bg-card card-enter">
          <CardHeader className="space-y-0 px-5 pb-1 pt-4">
            <CardTitle className="text-sm font-semibold">{t('dashboard.trafficChart')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-1">
            <Suspense fallback={<Skeleton className="h-56 w-full rounded-2xl" />}>
              <TrafficChart />
            </Suspense>
          </CardContent>
        </Card>
        <Card className="border-border bg-card card-enter">
          <CardHeader className="space-y-0 px-5 pb-1 pt-4">
            <CardTitle className="text-sm font-semibold">{t('dashboard.memoryChart')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-1">
            <Suspense fallback={<Skeleton className="h-56 w-full rounded-2xl" />}>
              <MemoryChart />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Driver matrix */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="text-sm font-semibold">{t('dashboard.driverList')}</CardTitle>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tnum">
              {connectedDrivers}/{drivers.length}
            </span>
          </div>
          <Link
            to={`${adminBase}/drivers`}
            className="flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline"
          >
            <span>{t('dashboard.manage', { defaultValue: 'Manage' })}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          {drivers.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title={t('dashboard.noDrivers', { defaultValue: 'No drivers configured' })}
              compact
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {drivers.map((drv) => {
                const st = ConnStateLabel[drv.state] || ConnStateLabel[0]
                return (
                  <div
                    key={drv.name}
                    className="min-w-0 rounded-2xl border border-border/70 bg-background/60 p-3 transition-colors hover:border-primary/30 hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${st.dotColor}`} />
                      <span className="truncate text-sm font-semibold">{drv.name}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {drv.type}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[11px] tnum">
                      <span className="text-muted-foreground">
                        R:
                        <span className="ml-1 font-medium text-foreground/80">
                          {formatNumber(drv.read_count)}
                        </span>
                      </span>
                      <span
                        className={
                          drv.error_count > 0 ? 'text-status-error' : 'text-muted-foreground/70'
                        }
                      >
                        E:{drv.error_count}
                      </span>
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
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="text-sm font-semibold">{t('dashboard.transportList')}</CardTitle>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tnum">
              {connectedTransports}/{transports.length}
            </span>
          </div>
          <Link
            to={`${adminBase}/transports`}
            className="flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline"
          >
            <span>{t('dashboard.manage', { defaultValue: 'Manage' })}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          {transports.length === 0 ? (
            <EmptyState
              icon={Send}
              title={t('dashboard.noTransports', { defaultValue: 'No transports configured' })}
              compact
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {transports.map((tr) => {
                const st = ConnStateLabel[tr.state] || ConnStateLabel[0]
                return (
                  <div
                    key={tr.name}
                    className="min-w-0 rounded-2xl border border-border/70 bg-background/60 p-3 transition-colors hover:border-primary/30 hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${st.dotColor}`} />
                      <span className="truncate text-sm font-semibold">{tr.name}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {tr.type}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[11px] tnum">
                      <span className="text-muted-foreground">
                        P:
                        <span className="ml-1 font-medium text-foreground/80">
                          {formatNumber(tr.published)}
                        </span>
                      </span>
                      <span
                        className={
                          tr.queue_size > 0 ? 'text-status-warning' : 'text-muted-foreground/70'
                        }
                      >
                        Q:{tr.queue_size}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 5 — Dead letters (failed writes) + current error-event lure */}
      <DashboardDeadLetterCard deadLetters={deadLetters} alertsLink={alertsLink} />
    </div>
  )
}
