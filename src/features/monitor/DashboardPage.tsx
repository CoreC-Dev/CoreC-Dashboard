import {
  Activity,
  AlertTriangle,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber, formatUptime } from '@/lib/utils'

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: stats } = useStats()
  const { data: driversData } = useDrivers()
  const { data: transportsData } = useTransports()
  const { data: deadLettersData } = useDeadLetters()

  const drivers = driversData?.drivers || []
  const transports = transportsData?.transports || []
  const deadLetters = deadLettersData?.failed_writes || []

  const connectedDrivers = drivers.filter((d) => d.state === 2).length
  const connectedTransports = transports.filter((t) => t.state === 2).length

  return (
    <div className="space-y-6">
      {/* KPI Top Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-card/70 border-border/80">
          <CardHeader className="p-3.5 pb-1">
            <CardDescription className="flex items-center justify-between text-[11px]">
              <span>Engine Status</span>
              <Activity className="w-3.5 h-3.5 text-primary" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 glow-success" />
              <span className="text-base font-bold capitalize">{stats?.status || 'Running'}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{formatUptime(stats?.uptime || 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/80">
          <CardHeader className="p-3.5 pb-1">
            <CardDescription className="flex items-center justify-between text-[11px]">
              <span>Sample Rate</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono">
              {stats?.points_per_sec?.toFixed(1) || '0.0'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">points / second</div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/80">
          <CardHeader className="p-3.5 pb-1">
            <CardDescription className="flex items-center justify-between text-[11px]">
              <span>Southbound Drivers</span>
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono">
              {connectedDrivers}{' '}
              <span className="text-xs text-muted-foreground font-normal">/ {drivers.length}</span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-1">
              {drivers.length ? Math.round((connectedDrivers / drivers.length) * 100) : 100}% Online
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/80">
          <CardHeader className="p-3.5 pb-1">
            <CardDescription className="flex items-center justify-between text-[11px]">
              <span>Northbound Sinks</span>
              <Send className="w-3.5 h-3.5 text-indigo-400" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono">
              {connectedTransports}{' '}
              <span className="text-xs text-muted-foreground font-normal">
                / {transports.length}
              </span>
            </div>
            <div className="text-[10px] text-emerald-400 mt-1">
              {transports.length
                ? Math.round((connectedTransports / transports.length) * 100)
                : 100}
              % Connected
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/80">
          <CardHeader className="p-3.5 pb-1">
            <CardDescription className="flex items-center justify-between text-[11px]">
              <span>Total Points Read</span>
              <Database className="w-3.5 h-3.5 text-amber-400" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono">
              {formatNumber(stats?.total_read || 0)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Pub: {formatNumber(stats?.total_publish || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/80">
          <CardHeader className="p-3.5 pb-1">
            <CardDescription className="flex items-center justify-between text-[11px]">
              <span>Backpressure Dropped</span>
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 pt-0">
            <div className="text-xl font-bold font-mono text-rose-400">
              {formatNumber(stats?.total_dropped || 0)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Errors: {stats?.total_errors || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Streaming Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">{t('dashboard.trafficChart')}</CardTitle>
              <CardDescription className="text-[11px]">
                WebSocket /traffic • Real-time ingress and egress throughput
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">Read</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Publish</span>
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <TrafficChart />
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">{t('dashboard.memoryChart')}</CardTitle>
              <CardDescription className="text-[11px]">
                WebSocket /memory • Non-STW runtime memory allocation & routines
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-muted-foreground">Heap Alloc</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                <span className="text-muted-foreground">Sys Mem</span>
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <MemoryChart />
          </CardContent>
        </Card>
      </div>

      {/* Driver & Transport Status Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Southbound Drivers */}
        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">{t('dashboard.driverList')}</CardTitle>
              <CardDescription className="text-[11px]">
                Modbus TCP/RTU/TLS, Siemens S7, OPC UA
              </CardDescription>
            </div>
            <Link
              to="/admin/drivers"
              className="text-xs text-primary hover:underline flex items-center space-x-1"
            >
              <span>Manage</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {drivers.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                No southbound drivers configured in CoreC
              </div>
            ) : (
              drivers.map((drv) => {
                const st = ConnStateLabel[drv.state] || ConnStateLabel[0]
                return (
                  <div
                    key={drv.name}
                    className="p-3 rounded-lg border border-border/70 bg-card/40 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <span className={`w-2 h-2 rounded-full ${st.dotColor}`} />
                      <div>
                        <div className="font-semibold text-foreground">{drv.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {drv.type}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Tags: </span>
                        <span className="font-mono font-medium">{drv.tag_count}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Reads: </span>
                        <span className="font-mono font-medium">
                          {formatNumber(drv.read_count)}
                        </span>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
                        {st.text}
                      </Badge>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Northbound Transports */}
        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                {t('dashboard.transportList')}
              </CardTitle>
              <CardDescription className="text-[11px]">
                MQTT Publishers, HTTP Push Webhooks
              </CardDescription>
            </div>
            <Link
              to="/admin/transports"
              className="text-xs text-primary hover:underline flex items-center space-x-1"
            >
              <span>Manage</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {transports.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                No northbound transports configured
              </div>
            ) : (
              transports.map((tr) => {
                const st = ConnStateLabel[tr.state] || ConnStateLabel[0]
                return (
                  <div
                    key={tr.name}
                    className="p-3 rounded-lg border border-border/70 bg-card/40 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <span className={`w-2 h-2 rounded-full ${st.dotColor}`} />
                      <div>
                        <div className="font-semibold text-foreground">{tr.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{tr.type}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Pub: </span>
                        <span className="font-mono font-medium">{formatNumber(tr.published)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Queue: </span>
                        <span className="font-mono font-medium">{tr.queue_size}</span>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
                        {st.text}
                      </Badge>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dead Letters & Recent Alerts */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>{t('dashboard.recentAlerts')}</span>
            </CardTitle>
            <CardDescription className="text-[11px]">
              Rules with 'alert' action and command write failures
            </CardDescription>
          </div>
          <Link
            to="/admin/write"
            className="text-xs text-primary hover:underline flex items-center space-x-1"
          >
            <span>View Dead Letters ({deadLetters.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {deadLetters.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
              <ShieldCheck className="w-6 h-6 text-emerald-400 mb-1" />
              <span>All systems healthy. No dead letter write failures detected.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {deadLetters.slice(0, 3).map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-mono font-semibold text-rose-400">
                      Write to [{item.command.driver}] tag: {item.command.tag} ={' '}
                      {String(item.command.value)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{item.error}</div>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant="outline"
                      className="border-rose-500/30 text-rose-400 text-[10px]"
                    >
                      {item.attempts} retries failed
                    </Badge>
                    <div className="text-[10px] text-muted-foreground mt-1">
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
