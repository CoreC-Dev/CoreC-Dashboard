import { AlertCircle, Cpu, GitBranch, Radio, Send } from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useConfigRaw,
  useConfigs,
  useDrivers,
  useRules,
  useServerInfo,
  useStats,
  useTransports,
} from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useParsedConfig } from '@/hooks/useParsedConfig'
import { getDriverConnectionSummary, getTransportConnectionSummary } from '@/lib/connectionInfo'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber, formatUptime } from '@/lib/utils'

export const TopologyPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: serverInfo, isError: serverInfoError } = useServerInfo()
  const { data: driversData, isError: driversError } = useDrivers()
  const { data: transportsData, isError: transportsError } = useTransports()
  const { data: stats, isError: statsError } = useStats()
  const { data: rulesData, isError: rulesError } = useRules()
  const { data: configsData } = useConfigs()
  const { data: rawYaml } = useConfigRaw()

  const drivers = driversData?.drivers || []
  const transports = transportsData?.transports || []
  const rules = rulesData?.rules || []
  const activeRules = rules.filter((r) => !r.disabled)
  const sortedRules = useMemo(() => [...rules].sort((a, b) => a.priority - b.priority), [rules])

  // Parse the raw config YAML once for connection-summary lookups. The raw
  // config is not polled (no refetchInterval), so this only re-parses when the
  // config is edited via PUT /configs.
  const config = useParsedConfig(rawYaml)

  const hasError = serverInfoError || driversError || transportsError || statsError || rulesError

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t('topology.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('topology.subtitle')}</p>
      </div>

      {hasError && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span>{t('common.error')}</span>
          </div>
        </Card>
      )}

      {/* Node Identity */}
      {configsData?.global && (
        <Card className="border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t('topology.nodeId')}:</span>
              <span className="font-mono font-semibold text-primary">
                {serverInfo?.name || 'corec'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t('topology.version')}:</span>
              <span className="font-mono">{serverInfo?.version || 'dev'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t('topology.listen')}:</span>
              <span className="font-mono">{configsData.global.api?.listen || '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t('topology.logLevel')}:</span>
              <span className="font-mono">{configsData.global['log-level'] || 'info'}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Visual Interactive Architecture Diagram */}
      <Card className="border-border bg-card p-6 overflow-hidden">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Southbound Layer */}
          <div className="flex-1 w-full space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span>{t('topology.southboundDevices', { count: drivers.length })}</span>
            </div>

            <div className="space-y-2">
              {drivers.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed text-xs text-muted-foreground text-center">
                  {t('topology.noDrivers', { defaultValue: 'No southbound drivers attached' })}
                </div>
              ) : (
                drivers.map((d) => {
                  const st = ConnStateLabel[d.state] || ConnStateLabel[0]
                  const connSummary = getDriverConnectionSummary(config, d.name)
                  return (
                    <div
                      key={d.name}
                      className="p-3 rounded-lg border border-border bg-card flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${st.dotColor}`} />
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{d.name}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {d.type}
                          </div>
                          {connSummary && (
                            <div className="text-xs text-muted-foreground/70 font-mono truncate">
                              {connSummary}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">
                          {t('topology.tagsCount', { count: d.tag_count })}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${st.badgeColor}`}>
                          {t(st.key)}
                        </Badge>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* CoreC Engine Node */}
          <div className="shrink-0 flex flex-col items-center justify-center p-6 rounded-2xl bg-primary/5 border-2 border-primary/30 shadow-xl glow-primary text-center max-w-xs w-full">
            <div className="w-12 h-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center mb-3 shadow-lg">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div className="font-bold text-base text-foreground">
              {serverInfo?.name || 'corec-node-01'}
            </div>
            <div className="text-xs text-primary font-mono font-medium mt-0.5">
              {t('topology.status')}: {stats?.status || '—'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('topology.uptime')}: {formatUptime(stats?.uptime || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2 w-full space-y-1">
              <div>
                {t('topology.throughput')}: {stats?.points_per_sec?.toFixed(1) || '0.0'}{' '}
                {t('topology.throughputUnit')}
              </div>
              <div>
                {t('topology.read')}: {formatNumber(stats?.total_read || 0)} · {t('topology.pub')}:{' '}
                {formatNumber(stats?.total_publish || 0)}
              </div>
              <div>{t('topology.tagline')}</div>
            </div>
          </div>

          {/* Northbound Layer */}
          <div className="flex-1 w-full space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
              <Send className="w-3.5 h-3.5 text-primary" />
              <span>{t('topology.northboundSinks', { count: transports.length })}</span>
            </div>

            <div className="space-y-2">
              {transports.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed text-xs text-muted-foreground text-center">
                  {t('topology.noTransports', {
                    defaultValue: 'No northbound transports attached',
                  })}
                </div>
              ) : (
                transports.map((transport) => {
                  const st = ConnStateLabel[transport.state] || ConnStateLabel[0]
                  const connSummary = getTransportConnectionSummary(config, transport.name)
                  return (
                    <div
                      key={transport.name}
                      className="p-3 rounded-lg border border-border bg-card text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${st.dotColor}`} />
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate">
                              {transport.name}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono truncate">
                              {transport.type}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs">
                            {t('topology.publishedSent', {
                              count: formatNumber(transport.published),
                            })}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${st.badgeColor}`}>
                            {t(st.key)}
                          </Badge>
                        </div>
                      </div>
                      {(connSummary ||
                        transport.failed ||
                        transport.received ||
                        transport.queue_size ||
                        transport.dropped_commands) && (
                        <div className="mt-1.5 flex items-center justify-between gap-2 pl-4">
                          <div className="text-xs text-muted-foreground/70 font-mono truncate min-w-0">
                            {connSummary}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono shrink-0 flex items-center gap-2">
                            <span>
                              {t('topology.received', { defaultValue: 'rcv' })}:
                              {formatNumber(transport.received)}
                            </span>
                            <span className="text-status-error">
                              {t('topology.failed', { defaultValue: 'fail' })}:
                              {formatNumber(transport.failed)}
                            </span>
                            <span>
                              {t('topology.queueSize', { defaultValue: 'q' })}:
                              {transport.queue_size}
                            </span>
                            <span className="text-status-warning">
                              {t('topology.droppedCmds', { defaultValue: 'drop' })}:
                              {formatNumber(transport.dropped_commands)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Rule Pipeline */}
      {rules.length > 0 && (
        <Card className="border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5 mb-3">
            <GitBranch className="w-3.5 h-3.5 text-status-warning" />
            <span>
              {t('topology.rulePipelineActive', {
                active: activeRules.length,
                total: rules.length,
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sortedRules.map((rule) => (
              <div
                key={rule.index}
                className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${
                  rule.disabled
                    ? 'border-border/40 bg-muted/20 opacity-50'
                    : 'border-status-warning/30 bg-status-warning/5'
                }`}
              >
                <span className="font-mono text-xs text-muted-foreground">#{rule.priority}</span>
                <span className="font-semibold text-foreground">{rule.name}</span>
                <Badge variant="outline" className="text-xs">
                  {rule.action}
                </Badge>
                {rule.disabled && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {t('topology.off')}
                  </Badge>
                )}
                {(rule.hit_count > 0 || rule.miss_count > 0) && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {rule.hit_count}↑/{rule.miss_count}↓
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
