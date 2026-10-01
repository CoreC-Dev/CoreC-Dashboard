import { dump } from 'js-yaml'
import {
  AlertCircle,
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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useConfigRaw, useTransport, useUpdateConfig } from '@/api/hooks'
import {
  BackLink,
  EntityEditConfigCard,
  formatTimestamp,
  Param,
  StatCard,
} from '@/components/admin/DetailPageParts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useParsedConfig } from '@/hooks/useParsedConfig'
import { dumpConfigYaml, parseConfigYaml, upsertTransport } from '@/lib/configYaml'
import { extractTransportYaml, getTransportConnectionFields } from '@/lib/connectionInfo'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import type { TransportConfig } from '@/types/config'
import type { TransportStatus } from '@/types/models'

// --- Transport Configuration Edit Section ---
// Renders a collapsible form that lets operators edit a transport's northbound
// publishing parameters, preview the generated YAML and hot-reload it through
// PUT /configs (useUpdateConfig). Fields are derived from the transport protocol.

type TransportFieldKind = 'text' | 'number' | 'select'

interface TransportEditField {
  key: string
  labelKey: string
  kind: TransportFieldKind
  group: 'settings' | 'top'
  options?: readonly string[]
  placeholder?: string
  /** Whether this select field stores a YAML boolean (options are "true"/"false"). */
  boolean?: boolean
}

const MQTT_FIELDS: readonly TransportEditField[] = [
  {
    key: 'broker',
    labelKey: 'transports.editConfig.broker',
    kind: 'text',
    group: 'settings',
    placeholder: 'tcp://broker.emqx.io:1883',
  },
  {
    key: 'topic-template',
    labelKey: 'transports.editConfig.topic',
    kind: 'text',
    group: 'settings',
    placeholder: 'factory/{{.Driver}}/{{.Tag}}',
  },
  {
    key: 'client-id',
    labelKey: 'transports.editConfig.clientId',
    kind: 'text',
    group: 'settings',
    placeholder: 'corec-001',
  },
  {
    key: 'qos',
    labelKey: 'transports.editConfig.qos',
    kind: 'select',
    group: 'settings',
    options: ['0', '1', '2'],
  },
  {
    key: 'data-topic',
    labelKey: 'transports.editConfig.dataTopic',
    kind: 'text',
    group: 'settings',
  },
  {
    key: 'command-topic',
    labelKey: 'transports.editConfig.commandTopic',
    kind: 'text',
    group: 'settings',
  },
  {
    key: 'retained',
    labelKey: 'transports.editConfig.retained',
    kind: 'select',
    group: 'settings',
    options: ['true', 'false'],
    boolean: true,
  },
  {
    key: 'clean-session',
    labelKey: 'transports.editConfig.cleanSession',
    kind: 'select',
    group: 'settings',
    options: ['true', 'false'],
    boolean: true,
  },
  {
    key: 'keep-alive',
    labelKey: 'transports.editConfig.keepAlive',
    kind: 'text',
    group: 'settings',
    placeholder: '30s',
  },
  {
    key: 'connect-timeout',
    labelKey: 'transports.editConfig.connectTimeout',
    kind: 'text',
    group: 'settings',
    placeholder: '5s',
  },
  {
    key: 'publish-timeout',
    labelKey: 'transports.editConfig.publishTimeout',
    kind: 'text',
    group: 'settings',
    placeholder: '10s',
  },
  {
    key: 'auto-reconnect',
    labelKey: 'transports.editConfig.autoReconnect',
    kind: 'select',
    group: 'settings',
    options: ['true', 'false'],
    boolean: true,
  },
  {
    key: 'username',
    labelKey: 'transports.editConfig.username',
    kind: 'text',
    group: 'settings',
  },
  {
    key: 'password',
    labelKey: 'transports.editConfig.password',
    kind: 'text',
    group: 'settings',
  },
  {
    key: 'retry-count',
    labelKey: 'transports.editConfig.retryCount',
    kind: 'number',
    group: 'top',
    placeholder: '3',
  },
  {
    key: 'buffer-size',
    labelKey: 'transports.editConfig.bufferSize',
    kind: 'number',
    group: 'top',
    placeholder: '100',
  },
]

const HTTP_FIELDS: readonly TransportEditField[] = [
  {
    key: 'url',
    labelKey: 'transports.editConfig.url',
    kind: 'text',
    group: 'settings',
    placeholder: 'https://example.com/ingest',
  },
  {
    key: 'method',
    labelKey: 'transports.editConfig.method',
    kind: 'select',
    group: 'settings',
    options: ['GET', 'POST', 'PUT'],
  },
  {
    key: 'headers',
    labelKey: 'transports.editConfig.headers',
    kind: 'text',
    group: 'settings',
    placeholder: 'Content-Type:application/json',
  },
  {
    key: 'webhook-addr',
    labelKey: 'transports.editConfig.webhookAddr',
    kind: 'text',
    group: 'settings',
    placeholder: '0.0.0.0:8080',
  },
  {
    key: 'webhook-path',
    labelKey: 'transports.editConfig.webhookPath',
    kind: 'text',
    group: 'settings',
    placeholder: '/webhook',
  },
  {
    key: 'webhook-secret',
    labelKey: 'transports.editConfig.webhookSecret',
    kind: 'text',
    group: 'settings',
  },
  {
    key: 'timeout',
    labelKey: 'transports.editConfig.timeout',
    kind: 'text',
    group: 'settings',
    placeholder: '10s',
  },
  {
    key: 'max-idle-conns',
    labelKey: 'transports.editConfig.maxIdleConns',
    kind: 'number',
    group: 'settings',
    placeholder: '100',
  },
  {
    key: 'idle-conn-timeout',
    labelKey: 'transports.editConfig.idleConnTimeout',
    kind: 'text',
    group: 'settings',
    placeholder: '90s',
  },
  {
    key: 'batch-size',
    labelKey: 'transports.editConfig.batchSize',
    kind: 'number',
    group: 'top',
    placeholder: '50',
  },
  {
    key: 'flush-interval',
    labelKey: 'transports.editConfig.flushInterval',
    kind: 'text',
    group: 'top',
    placeholder: '1s',
  },
  {
    key: 'retry-count',
    labelKey: 'transports.editConfig.retryCount',
    kind: 'number',
    group: 'top',
    placeholder: '3',
  },
  {
    key: 'buffer-size',
    labelKey: 'transports.editConfig.bufferSize',
    kind: 'number',
    group: 'top',
    placeholder: '100',
  },
]

function getTransportFields(type: string): readonly TransportEditField[] {
  const lower = type.toLowerCase()
  if (lower.includes('mqtt')) return MQTT_FIELDS
  if (lower.includes('http')) return HTTP_FIELDS
  return []
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':')
    if (idx <= 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

/** Serialize an existing config value into the string form the edit form uses.
 *  Handles objects (e.g. headers) and numbers. [C-2] */
function configValueToString(f: TransportEditField, src: unknown): string {
  if (src === undefined || src === null) return ''
  if (f.key === 'headers' && typeof src === 'object' && !Array.isArray(src)) {
    return Object.entries(src as Record<string, unknown>)
      .map(([k, v]) => `${k}:${String(v)}`)
      .join(',')
  }
  if (typeof src === 'object') return JSON.stringify(src)
  return String(src)
}

function buildTransportEntry(
  transport: TransportStatus,
  fields: readonly TransportEditField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {}
  const top: Record<string, unknown> = {}
  for (const f of fields) {
    const raw = (values[f.key] ?? '').trim()
    if (raw === '') continue
    let val: unknown
    if (f.key === 'headers') {
      const headers = parseHeaders(raw)
      if (Object.keys(headers).length === 0) continue
      val = headers
    } else if (f.boolean) {
      val = raw === 'true'
    } else if (f.kind === 'number') {
      const n = Number(raw)
      val = Number.isNaN(n) ? raw : n
    } else {
      val = raw
    }
    if (f.group === 'settings') settings[f.key] = val
    else top[f.key] = val
  }
  const entry: Record<string, unknown> = { name: transport.name, type: transport.type }
  if (Object.keys(settings).length > 0) entry.settings = settings
  // Top-level transport fields (batch-size, flush-interval, retry-count, buffer-size).
  for (const [k, v] of Object.entries(top)) entry[k] = v
  return entry
}

function buildTransportYaml(
  transport: TransportStatus,
  fields: readonly TransportEditField[],
  values: Record<string, string>,
): string {
  return dump(
    { transports: [buildTransportEntry(transport, fields, values)] },
    { skipInvalid: true, noRefs: true, lineWidth: -1 },
  )
}

const TransportEditConfigSection: React.FC<{ transport: TransportStatus }> = ({ transport }) => {
  const { t } = useTranslation()
  const updateConfig = useUpdateConfig()
  const { data: rawYaml } = useConfigRaw()
  const [open, setOpen] = useState(false)
  const fields = useMemo(() => getTransportFields(transport.type), [transport.type])
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) init[f.key] = ''
    return init
  })
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  // Pre-fill form from the existing server config so the operator can see and
  // preserve current settings instead of starting from empty inputs. [C-2]
  // Secrets come back redacted as "***" and must be re-entered — that is an
  // inherent limitation of the redacted raw view.
  useEffect(() => {
    if (!rawYaml) return
    try {
      const cfg = parseConfigYaml(rawYaml)
      const me = cfg.transports?.find((tp) => tp.name === transport.name)
      if (!me) return
      const init: Record<string, string> = {}
      for (const f of fields) {
        const src = f.group === 'settings' ? me.settings?.[f.key] : me[f.key as keyof typeof me]
        init[f.key] = configValueToString(f, src)
      }
      setValues(init)
    } catch {
      // If YAML parse fails, leave the form empty — don't crash the page.
    }
  }, [rawYaml, transport.name, fields])

  // Preview: just the transport section (readable for the operator).
  const previewYaml = useMemo(
    () => buildTransportYaml(transport, fields, values),
    [transport, fields, values],
  )

  // Apply: merge the edited transport into the FULL config so PUT /configs
  // doesn't wipe every other section. Falls back to the single-transport doc
  // only if the raw config can't be parsed.
  const applyYaml = useMemo(() => {
    if (!rawYaml) return previewYaml
    try {
      const fullConfig = parseConfigYaml(rawYaml)
      const existing = fullConfig.transports?.find((tp) => tp.name === transport.name)
      const entry = buildTransportEntry(transport, fields, values)
      const base: TransportConfig = existing ?? {
        name: transport.name,
        type: transport.type,
        settings: {},
      }
      const updatedTransport = { ...base, ...entry } as TransportConfig
      return dumpConfigYaml(upsertTransport(fullConfig, updatedTransport))
    } catch {
      return previewYaml
    }
  }, [rawYaml, transport, fields, values, previewYaml])

  const setField = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const handleGenerateAndReload = async () => {
    setStatusMsg(null)
    try {
      await updateConfig.mutateAsync({ payload: applyYaml })
      setStatusMsg({ type: 'success', text: t('transports.editConfig.reloadSuccess') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setStatusMsg({
        type: 'error',
        text: msg || t('transports.editConfig.reloadFailed'),
      })
    }
  }

  return (
    <EntityEditConfigCard
      title={t('transports.editConfig.title')}
      description={t('transports.editConfig.description')}
      toggleAriaLabel={t('transports.editConfig.toggle')}
      open={open}
      onToggleOpen={() => setOpen((o) => !o)}
      fields={fields}
      fieldIdPrefix="transport-field-"
      labelFor={(f) => t(f.labelKey)}
      values={values}
      onFieldChange={setField}
      unsupportedMessage={t('transports.editConfig.unsupportedProtocol')}
      yamlPreviewLabel={t('transports.editConfig.yamlPreview')}
      yamlPreview={previewYaml}
      statusMsg={statusMsg}
      reloadingLabel={t('transports.editConfig.reloading')}
      reloadButtonLabel={t('transports.editConfig.generateAndReload')}
      isReloading={updateConfig.isPending}
      onReload={handleGenerateAndReload}
    />
  )
}

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
        <div className="py-16 text-center text-xs text-muted-foreground">
          {t('common.loading', { defaultValue: 'Loading transport...' })}
        </div>
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
              <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-status-idle p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-status-idle">
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
