import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ChevronDown,
  Inbox,
  Layers,
  RefreshCw,
  Send,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useConfigRaw, useTransport } from '@/api/hooks'
import { BackLink, formatTimestamp, Param, StatCard } from '@/components/admin/DetailPageParts'
import { TransportTestSender } from '@/components/admin/TransportTestSender'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { TransportEditConfigSection } from '@/features/admin/transportDetail/EditConfigSection'
import { useParsedConfig } from '@/hooks/useParsedConfig'
import { extractTransportYaml, getTransportConnectionFields } from '@/lib/connectionInfo'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'

// ─── Transport detail page ────────────────────────────────────────────
// The quick-edit form + its helpers live in ./transportDetail/
// (D2, quality audit 2026-10-21 — the former 677-line page split by
// concern; behavior identical).

export const TransportDetailPage: React.FC = () => {
  const { t } = useTranslation()
  const { name, id } = useParams<{ name: string; id: string }>()
  const adminBase = id ? `/corec/${id}/admin` : '/admin'
  const { data: transport, isLoading, error, refetch, isFetching } = useTransport(name ?? '')
  // Full config YAML (GET /configs/raw). The /transports endpoint returns only
  // runtime status + counters, so connection params & the YAML snippet are read
  // from here. React Query dedupes this with the fetch inside TransportEditConfigSection.
  const { data: rawYaml, isLoading: configLoading } = useConfigRaw()
  const [yamlOpen, setYamlOpen] = useState(false)

  const config = useParsedConfig(rawYaml)
  const connFields = useMemo(
    () => (transport ? getTransportConnectionFields(config, transport.name) : []),
    [config, transport],
  )
  const yamlSnippet = useMemo(
    () => (rawYaml && transport ? extractTransportYaml(rawYaml, transport.name) : ''),
    [rawYaml, transport],
  )

  if (isLoading) {
    return (
      <div className="space-y-5">
        <BackLink to={`${adminBase}/transports`}>
          {t('transports.transportList', { defaultValue: 'Back to Transports' })}
        </BackLink>
        <LoadingState text={t('common.loading', { defaultValue: 'Loading transport...' })} />
      </div>
    )
  }

  if (error || !transport) {
    return (
      <div className="space-y-5">
        <BackLink to={`${adminBase}/transports`}>
          {t('transports.transportList', { defaultValue: 'Back to Transports' })}
        </BackLink>
        <Card className="border-dashed bg-card">
          <CardContent className="space-y-2 p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-status-error" />
            <div className="text-sm font-semibold">{t('transports.detailNotFound')}</div>
            <div className="text-xs text-muted-foreground">
              {name ? t('transports.notRegistered', { name }) : t('transports.noNameProvided')}
            </div>
            {error instanceof Error && error.message && (
              <div className="break-all font-mono text-xs text-status-error/80">
                {error.message}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const st = ConnStateLabel[transport.state] ?? ConnStateLabel[0]
  const queuePct = Math.max(0, Math.min(100, transport.queue_size))
  const queueActive = transport.queue_size > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink to={`${adminBase}/transports`}>
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
      <Card className="bg-card">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">{transport.name}</CardTitle>
              <CardDescription className="font-mono text-xs">{transport.type}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs ${st.badgeColor}`}>
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
            {t(st.key)}
          </Badge>
        </CardHeader>
      </Card>

      {/* C-A15: connectivity probe — publishes one synthetic data point
          through the running transport (POST /transports/{name}/test);
          the wizard cannot offer this because the instance must already
          be registered (config saved & applied). */}
      <TransportTestSender name={transport.name} />

      {/* Publishing stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('transports.published')}
          value={formatNumber(transport.published)}
          icon={<TrendingUp className="h-5 w-5 text-status-running" />}
          accent="border border-status-running/20 bg-status-running/10"
        />
        <StatCard
          label={t('transports.failed')}
          value={formatNumber(transport.failed)}
          icon={<XCircle className="h-5 w-5 text-status-error" />}
          accent="border border-status-error/20 bg-status-error/10"
        />
        <StatCard
          label={t('transports.received')}
          value={formatNumber(transport.received)}
          icon={<Inbox className="h-5 w-5 text-primary" />}
          accent="border border-primary/20 bg-primary/10"
        />
        <StatCard
          label={t('transports.droppedCommands')}
          value={formatNumber(transport.dropped_commands)}
          icon={<Archive className="h-5 w-5 text-status-warning" />}
          accent="border border-status-warning/20 bg-status-warning/10"
        />
      </div>

      {/* C-A14: dropped_commands was a bare number with no meaning — the
          counter card above says WHAT, this note says SO WHAT: dropped is
          unrecoverable, and the retry-exhausted commands it counts are
          reviewable (and manually replayable) in the write-control page's
          dead-letter queue. */}
      {transport.dropped_commands > 0 && (
        <Card className="border-status-warning/40 bg-status-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-status-warning">
              <AlertTriangle className="h-4 w-4" />
              {t('transports.droppedCardTitle', { count: transport.dropped_commands })}
            </CardTitle>
            <CardDescription className="text-xs">{t('transports.droppedCardDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              to={`${adminBase}/write`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('transports.viewDeadLetters')} →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Queue depth indicator */}
      <Card className={`bg-card ${queueActive ? 'border-status-warning/40' : ''}`}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              {t('transports.queueDepth')}
            </span>
            {queueActive ? (
              <Badge
                variant="outline"
                className="text-xs border-status-warning/30 bg-status-warning/10 text-status-warning"
              >
                {t('transports.backpressure')}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-xs border-status-running/30 bg-status-running/10 text-status-running"
              >
                {t('transports.drained')}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{t('transports.queueDepthDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('transports.queueSize')}
            </span>
            <span
              className={`font-mono text-xl font-bold ${queueActive ? 'text-status-warning' : 'text-foreground'}`}
            >
              {formatNumber(transport.queue_size)}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                queueActive ? 'bg-status-warning' : 'bg-status-running'
              }`}
              style={{ width: `${queuePct}%` }}
            />
          </div>
          {queueActive && (
            <div className="flex items-start gap-2 rounded-lg border border-status-warning/20 bg-status-warning/10 p-2.5 text-status-warning">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="text-xs">
                {t('transports.commandsQueued', { count: formatNumber(transport.queue_size) })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connection & publishing parameters */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Send className="h-4 w-4 text-primary" />
            {t('transports.connectionPublishingParams')}
          </CardTitle>
          <CardDescription>{t('transports.connectionPublishingDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
            <Param label={t('transports.transportName')}>
              <span className="font-mono">{transport.name}</span>
            </Param>
            <Param label={t('transports.protocolType')}>
              <span className="font-mono">{transport.type}</span>
            </Param>
            <Param label={t('transports.connectionState')}>
              <Badge variant="outline" className={`text-xs ${st.badgeColor}`}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
                {t(st.key)}
              </Badge>
            </Param>
            <Param label={t('transports.published')}>
              <span className="font-mono text-status-running">
                {formatNumber(transport.published)}
              </span>
            </Param>
            <Param label={t('transports.failed')}>
              <span className={`font-mono ${transport.failed > 0 ? 'text-status-error' : ''}`}>
                {formatNumber(transport.failed)}
              </span>
            </Param>
            <Param label={t('transports.received')}>
              <span className="font-mono text-primary">{formatNumber(transport.received)}</span>
            </Param>
            <Param label={t('transports.lastPublish')}>
              <span className="font-mono">
                {formatTimestamp(transport.last_publish, t('common.never'))}
              </span>
            </Param>
            <Param label={t('transports.queueSize')}>
              <span className={`font-mono ${queueActive ? 'text-status-warning' : ''}`}>
                {formatNumber(transport.queue_size)}
              </span>
            </Param>
            <Param label={t('transports.droppedCommands')}>
              <span
                className={`font-mono ${transport.dropped_commands > 0 ? 'text-status-warning' : ''}`}
              >
                {formatNumber(transport.dropped_commands)}
              </span>
            </Param>
          </div>
        </CardContent>
      </Card>

      {/* Connection Info (read-only, from /configs/raw) */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Send className="h-4 w-4 text-primary" />
            {t('transports.connectionInfo')}
          </CardTitle>
          <CardDescription>{t('transports.connectionInfoDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="text-xs text-muted-foreground">{t('common.loading')}</div>
          ) : connFields.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {t('transports.connectionInfoEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {connFields.map((f) => (
                <div key={f.label} className="min-w-0 space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </div>
                  <div
                    className={`break-all font-mono text-xs ${
                      f.primary ? 'font-bold text-foreground' : 'font-medium text-foreground/90'
                    }`}
                  >
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current YAML config snippet (collapsible, collapsed by default) */}
      <Card className="bg-card">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" />
            {t('transports.currentYaml')}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => setYamlOpen((o) => !o)}
            aria-label={t('transports.currentYamlToggle')}
            aria-expanded={yamlOpen}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${yamlOpen ? 'rotate-180' : ''}`}
            />
          </Button>
        </CardHeader>
        {yamlOpen && (
          <CardContent>
            {yamlSnippet.trim() ? (
              <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
                {yamlSnippet}
              </pre>
            ) : (
              <div className="text-xs text-muted-foreground">
                {t('transports.currentYamlEmpty')}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Edit Configuration (hot-reload via PUT /configs) */}
      <TransportEditConfigSection transport={transport} key={transport.name} />
    </div>
  )
}
