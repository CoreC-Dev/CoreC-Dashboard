import {
  Activity,
  ArrowUpRight,
  Clock,
  Cpu,
  Database,
  Send,
  ShieldCheck,
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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber, formatUptime } from '@/lib/utils'

/**
 * Monitor dashboard — fixed 5-row layout per ARCHITECTURE_RESTRUCTURE.md.
 *
 * Row 1: KPI indicators (6 small cards: status, uptime, reads, publishes, dropped, pts/sec)
 * Row 2: Real-time charts (traffic + memory, side by side)
 * Row 3: Driver matrix (compact cards)
 * Row 4: Transport matrix (compact cards)
 * Row 5: Recent alerts / dead letters
 *
 * No customizable layout — fixed design for out-of-the-box best experience.
 */
export const DashboardPage: React.FC = () => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { data: stats } = useStats()
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
    ? 'bg-emerald-400 glow-success'
    : isStatusError
      ? 'bg-rose-400'
      : 'bg-amber-400'

  const adminBase = id ? `/corec/${id}/admin` : '/admin'
  const alertsLink = id ? `/corec/${id}/monitor/alerts` : '/monitor/alerts'

  return (
    <div className="space-y-4">
      {/* Row 1 — KPI indicators */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Engine Status */}
        <div className="rounded-lg border border-border/60 bg-card/50 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t('dashboard.engineStatus')}</span>
            <Activity className="w-3 h-3 text-primary" />
          </div>
          <div className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
            <span className="text-sm font-bold capitalize">
              {stats?.status || t('common.running')}
            </span>
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center space-x-1">
            <Clock className="w-2.5 h-2.5" />
            <span>{formatUptime(stats?.uptime || 0)}</span>
          </div>
        </div>
        {/* Sample Rate */}
        <div className="rounded-lg border border-border/60 bg-card/50 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t('dashboard.sampleRate')}</span>
            <TrendingUp className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="text-base font-bold font-mono">
            {stats?.points_per_sec?.toFixed(1) || '0.0'}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {t('dashboard.pointsPerSecond', { defaultValue: 'points / second' })}
          </div>
        </div>
        {/* Drivers */}
        <div className="rounded-lg border border-border/60 bg-card/50 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t('dashboard.drivers')}</span>
            <Cpu className="w-3 h-3 text-blue-400" />
          </div>
          <div className="text-base font-bold font-mono">
            {connectedDrivers}{' '}
            <span className="text-[10px] text-muted-foreground font-normal">
              / {drivers.length}
            </span>
          </div>
          <div className="text-[9px] text-emerald-400">
            {drivers.length === 0
              ? t('dashboard.notAvailable', { defaultValue: 'N/A' })
              : `${Math.round((connectedDrivers / drivers.length) * 100)}%${t('dashboard.onlineSuffix')}`}
          </div>
        </div>
        {/* Transports */}
        <div className="rounded-lg border border-border/60 bg-card/50 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t('dashboard.sinks')}</span>
            <Send className="w-3 h-3 text-indigo-400" />
          </div>
          <div className="text-base font-bold font-mono">
            {connectedTransports}{' '}
            <span className="text-[10px] text-muted-foreground font-normal">
              / {transports.length}
            </span>
          </div>
          <div className="text-[9px] text-emerald-400">
            {transports.length === 0
              ? t('dashboard.notAvailable', { defaultValue: 'N/A' })
              : `${Math.round((connectedTransports / transports.length) * 100)}% ${t('dashboard.connected')}`}
          </div>
        </div>
        {/* Total Read */}
        <div className="rounded-lg border border-border/60 bg-card/50 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t('dashboard.totalRead')}</span>
            <Database className="w-3 h-3 text-amber-400" />
          </div>
          <div className="text-base font-bold font-mono">
            {formatNumber(stats?.total_read || 0)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {t('dashboard.pub', { defaultValue: 'Pub' })}: {formatNumber(stats?.total_publish || 0)}
          </div>
        </div>
        {/* Dropped */}
        <div className="rounded-lg border border-border/60 bg-card/50 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t('dashboard.dropped')}</span>
            <TrendingDown className="w-3 h-3 text-rose-400" />
          </div>
          <div className="text-base font-bold font-mono text-rose-400">
            {formatNumber(stats?.total_dropped || 0)}
          </div>
          <div className="text-[9px] text-muted-foreground">
            {t('dashboard.errors', { defaultValue: 'Errors' })}: {stats?.total_errors || 0}
          </div>
        </div>
      </div>

      {/* Row 2 — Real-time charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold">{t('dashboard.trafficChart')}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <TrafficChart />
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold">{t('dashboard.memoryChart')}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <MemoryChart />
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Driver matrix */}
      <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
        <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold">{t('dashboard.driverList')}</CardTitle>
          <Link
            to={`${adminBase}/drivers`}
            className="text-[10px] text-primary hover:underline flex items-center space-x-0.5"
          >
            <span>{t('dashboard.manage', { defaultValue: 'Manage' })}</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {drivers.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              {t('dashboard.noDrivers', { defaultValue: 'No drivers configured' })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {drivers.map((drv) => {
                const st = ConnStateLabel[drv.state] || ConnStateLabel[0]
                return (
                  <div
                    key={drv.name}
                    className="p-2 rounded-lg border border-border/60 bg-card/40 text-xs"
                  >
                    <div className="flex items-center space-x-1.5 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dotColor}`} />
                      <span className="font-semibold truncate">{drv.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">{drv.type}</div>
                    <div className="flex items-center justify-between mt-1 text-[10px]">
                      <span className="text-muted-foreground">
                        R:{formatNumber(drv.read_count)}
                      </span>
                      <span className="text-rose-400">E:{drv.error_count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 4 — Transport matrix */}
      <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
        <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold">{t('dashboard.transportList')}</CardTitle>
          <Link
            to={`${adminBase}/transports`}
            className="text-[10px] text-primary hover:underline flex items-center space-x-0.5"
          >
            <span>{t('dashboard.manage', { defaultValue: 'Manage' })}</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {transports.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              {t('dashboard.noTransports', { defaultValue: 'No transports configured' })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {transports.map((tr) => {
                const st = ConnStateLabel[tr.state] || ConnStateLabel[0]
                return (
                  <div
                    key={tr.name}
                    className="p-2 rounded-lg border border-border/60 bg-card/40 text-xs"
                  >
                    <div className="flex items-center space-x-1.5 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dotColor}`} />
                      <span className="font-semibold truncate">{tr.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">{tr.type}</div>
                    <div className="flex items-center justify-between mt-1 text-[10px]">
                      <span className="text-muted-foreground">P:{formatNumber(tr.published)}</span>
                      <span className="text-amber-400">Q:{tr.queue_size}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 5 — Recent alerts / dead letters */}
      <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
        <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold">{t('dashboard.recentAlerts')}</CardTitle>
          <Link
            to={alertsLink}
            className="text-[10px] text-primary hover:underline flex items-center space-x-0.5"
          >
            <span>{t('dashboard.manage', { defaultValue: 'View All' })}</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {deadLetters.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mb-1" />
              <span>
                {t('dashboard.allHealthy', {
                  defaultValue: 'All systems healthy. No dead letter write failures.',
                })}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {deadLetters.slice(0, 8).map((item) => (
                <div
                  key={`${item.command.driver}-${item.command.tag}-${item.failed_at}-${item.attempts}`}
                  className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-mono font-semibold text-rose-400 truncate">
                      [{item.command.driver}] {item.command.tag} = {String(item.command.value)}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{item.error}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <Badge
                      variant="outline"
                      className="border-rose-500/30 text-rose-400 text-[9px]"
                    >
                      {t('dashboard.retries', { count: item.attempts })}
                    </Badge>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {new Date(item.failed_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
