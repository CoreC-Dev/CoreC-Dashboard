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
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useDeadLetters, useDrivers, useStats, useTransports } from '@/api/hooks'
import { MemoryChart } from '@/components/charts/MemoryChart'
import { TrafficChart } from '@/components/charts/TrafficChart'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber, formatUptime } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { DashboardCard } from '@/types/dashboard'

/**
 * Monitor dashboard.
 *
 * Renders the layout authored in the Dashboard Editor (admin/dashboard-editor)
 * by reading `useDashboardStore.currentLayout.cards`. Each card is positioned
 * on a 12-column CSS grid using its stored x/y/w/h. This closes the P0-4 gap
 * where the editor mutated the store but the dashboard rendered a hardcoded
 * layout — editor add/remove/title changes now take effect here.
 *
 * The full react-grid-layout drag/resize editor (proposal A5) is a later
 * phase; the read-only grid here shares the same layout schema.
 */
export const DashboardPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: stats } = useStats()
  const { data: driversData } = useDrivers()
  const { data: transportsData } = useTransports()
  const { data: deadLettersData } = useDeadLetters()
  const cards = useDashboardStore((s) => s.currentLayout.cards)

  const drivers = driversData?.drivers || []
  const transports = transportsData?.transports || []
  const deadLetters = deadLettersData?.failed_writes || []

  const connectedDrivers = drivers.filter((d) => d.state === 2).length
  const connectedTransports = transports.filter((tr) => tr.state === 2).length

  const renderCardContent = (card: DashboardCard): React.ReactNode => {
    switch (card.type) {
      case 'kpi-summary':
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 h-full content-center">
            {/* Engine Status */}
            <div className="rounded-lg border border-border/60 bg-card/50 p-2.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>{t('dashboard.engineStatus')}</span>
                <Activity className="w-3 h-3 text-primary" />
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 glow-success" />
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
                {drivers.length ? Math.round((connectedDrivers / drivers.length) * 100) : 100}%
                {t('dashboard.onlineSuffix')}
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
                {transports.length
                  ? Math.round((connectedTransports / transports.length) * 100)
                  : 100}
                % {t('dashboard.connected')}
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
                {t('dashboard.pub', { defaultValue: 'Pub' })}:{' '}
                {formatNumber(stats?.total_publish || 0)}
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
        )

      case 'traffic-chart':
        return <TrafficChart />

      case 'memory-chart':
        return <MemoryChart />

      case 'driver-status-list':
        return (
          <div className="space-y-2 overflow-auto h-full pr-1">
            {drivers.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                {t('dashboard.noDrivers', { defaultValue: 'No drivers configured' })}
              </div>
            ) : (
              drivers.map((drv) => {
                const st = ConnStateLabel[drv.state] || ConnStateLabel[0]
                return (
                  <div
                    key={drv.name}
                    className="p-2.5 rounded-lg border border-border/60 bg-card/40 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-2 h-2 rounded-full ${st.dotColor}`} />
                      <div>
                        <div className="font-semibold text-foreground">{drv.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {drv.type}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 text-[10px]">
                      <span className="text-muted-foreground">
                        {t('dashboard.tags')}:{' '}
                        <span className="font-mono font-medium">{drv.tag_count}</span>
                      </span>
                      <span className="text-muted-foreground">
                        {t('dashboard.reads')}:{' '}
                        <span className="font-mono font-medium">
                          {formatNumber(drv.read_count)}
                        </span>
                      </span>
                      <Badge variant="outline" className={`text-[9px] ${st.badgeColor}`}>
                        {t(st.key)}
                      </Badge>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )

      case 'transport-status-list':
        return (
          <div className="space-y-2 overflow-auto h-full pr-1">
            {transports.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                {t('dashboard.noTransports', { defaultValue: 'No transports configured' })}
              </div>
            ) : (
              transports.map((tr) => {
                const st = ConnStateLabel[tr.state] || ConnStateLabel[0]
                return (
                  <div
                    key={tr.name}
                    className="p-2.5 rounded-lg border border-border/60 bg-card/40 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-2 h-2 rounded-full ${st.dotColor}`} />
                      <div>
                        <div className="font-semibold text-foreground">{tr.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{tr.type}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 text-[10px]">
                      <span className="text-muted-foreground">
                        {t('dashboard.pub')}:{' '}
                        <span className="font-mono font-medium">{formatNumber(tr.published)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        {t('dashboard.queue')}:{' '}
                        <span className="font-mono font-medium">{tr.queue_size}</span>
                      </span>
                      <Badge variant="outline" className={`text-[9px] ${st.badgeColor}`}>
                        {t(st.key)}
                      </Badge>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )

      case 'recent-alerts':
        return (
          <div className="space-y-2 overflow-auto h-full pr-1">
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
              deadLetters.slice(0, 5).map((item) => (
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
              ))
            )}
          </div>
        )

      default:
        return (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground py-8">
            {t('dashboard.unknownCardType', {
              type: card.type,
              defaultValue: 'Unknown card type: {{type}}',
            })}
          </div>
        )
    }
  }

  return (
    <div className="dashboard-grid">
      {cards.map((card) => (
        <div
          key={card.id}
          className="dashboard-grid-item"
          style={{
            gridColumn: `${card.layout.x + 1} / span ${card.layout.w}`,
            gridRow: `${card.layout.y + 1} / span ${card.layout.h}`,
          }}
        >
          <Card className="border-border/80 bg-card/60 backdrop-blur-sm h-full flex flex-col overflow-hidden">
            <CardHeader className="p-3 pb-1 shrink-0">
              <CardTitle className="text-xs font-semibold flex items-center justify-between">
                <span>{card.title}</span>
                {(card.type === 'driver-status-list' ||
                  card.type === 'transport-status-list' ||
                  card.type === 'recent-alerts') && (
                  <Link
                    to={
                      card.type === 'driver-status-list'
                        ? '/admin/drivers'
                        : card.type === 'transport-status-list'
                          ? '/admin/transports'
                          : '/admin/write'
                    }
                    className="text-[10px] text-primary hover:underline flex items-center space-x-0.5"
                  >
                    <span>{t('dashboard.manage', { defaultValue: 'Manage' })}</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 flex-1 min-h-0 overflow-hidden">
              {renderCardContent(card)}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
