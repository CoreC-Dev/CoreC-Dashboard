import { dump } from 'js-yaml'
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Flame,
  Inbox,
  Layers,
  Loader2,
  RefreshCw,
  Send,
  Sliders,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useTransport, useUpdateConfig } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber, isZeroTime } from '@/lib/utils'
import type { TransportStatus } from '@/types/models'

// CoreC emits Go's zero time (0001-01-01T00:00:00Z) for unset timestamps.
// Use the shared isZeroTime from utils which also catches Unix epoch variants.

const formatTimestamp = (ts: string, fallback = '—'): string => {
  if (isZeroTime(ts)) return fallback
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
    key: 'topic',
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

function buildTransportYaml(
  transport: TransportStatus,
  fields: readonly TransportEditField[],
  values: Record<string, string>,
): string {
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
  if (top['batch-size'] !== undefined) entry['batch-size'] = top['batch-size']
  if (top['flush-interval'] !== undefined) entry['flush-interval'] = top['flush-interval']
  return dump({ transports: [entry] }, { skipInvalid: true, noRefs: true, lineWidth: -1 })
}

const TransportEditConfigSection: React.FC<{ transport: TransportStatus }> = ({ transport }) => {
  const { t } = useTranslation()
  const updateConfig = useUpdateConfig()
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

  const generatedYaml = useMemo(
    () => buildTransportYaml(transport, fields, values),
    [transport, fields, values],
  )

  const setField = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const handleGenerateAndReload = async () => {
    setStatusMsg(null)
    try {
      await updateConfig.mutateAsync({ payload: generatedYaml })
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
    <Card className="bg-card/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          <div>
            <CardTitle className="text-sm font-semibold">
              {t('transports.editConfig.title')}
            </CardTitle>
            <CardDescription>{t('transports.editConfig.description')}</CardDescription>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => setOpen((o) => !o)}
          aria-label={t('transports.editConfig.toggle')}
          aria-expanded={open}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {fields.length === 0 ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-400">
              {t('transports.editConfig.unsupportedProtocol')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
                {fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <label
                      htmlFor={`transport-field-${f.key}`}
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      {t(f.labelKey)}
                    </label>
                    {f.kind === 'select' && f.options ? (
                      <Select value={values[f.key] ?? ''} onValueChange={(v) => setField(f.key, v)}>
                        <SelectTrigger id={`transport-field-${f.key}`} className="h-9 text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`transport-field-${f.key}`}
                        type={f.kind === 'number' ? 'number' : 'text'}
                        value={values[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => setField(f.key, e.target.value)}
                        className="h-9 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-muted-foreground">
                  {t('transports.editConfig.yamlPreview')}
                </div>
                <pre className="max-h-56 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground">
                  {generatedYaml}
                </pre>
              </div>

              {statusMsg && (
                <div
                  className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                    statusMsg.type === 'success'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-500'
                  }`}
                >
                  {statusMsg.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span className="break-all">{statusMsg.text}</span>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleGenerateAndReload}
                  disabled={updateConfig.isPending}
                  className="h-8 text-xs"
                >
                  {updateConfig.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Flame className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span>
                    {updateConfig.isPending
                      ? t('transports.editConfig.reloading')
                      : t('transports.editConfig.generateAndReload')}
                  </span>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}

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
              {name ? t('transports.notRegistered', { name }) : t('transports.noNameProvided')}
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
  const queuePct = Math.max(0, Math.min(100, transport.queue_size))
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
          label={t('transports.published')}
          value={formatNumber(transport.published)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          accent="border border-emerald-500/20 bg-emerald-500/10"
        />
        <StatCard
          label={t('transports.failed')}
          value={formatNumber(transport.failed)}
          icon={<XCircle className="h-5 w-5 text-rose-400" />}
          accent="border border-rose-500/20 bg-rose-500/10"
        />
        <StatCard
          label={t('transports.received')}
          value={formatNumber(transport.received)}
          icon={<Inbox className="h-5 w-5 text-sky-400" />}
          accent="border border-sky-500/20 bg-sky-500/10"
        />
        <StatCard
          label={t('transports.droppedCommands')}
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
              {t('transports.queueDepth')}
            </span>
            {queueActive ? (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-400"
              >
                {t('transports.backpressure')}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              >
                {t('transports.drained')}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{t('transports.queueDepthDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('transports.queueSize')}
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
                {t('transports.commandsQueued', { count: formatNumber(transport.queue_size) })}
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
              <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
                {t(st.key)}
              </Badge>
            </Param>
            <Param label={t('transports.published')}>
              <span className="font-mono text-emerald-400">
                {formatNumber(transport.published)}
              </span>
            </Param>
            <Param label={t('transports.failed')}>
              <span className={`font-mono ${transport.failed > 0 ? 'text-rose-400' : ''}`}>
                {formatNumber(transport.failed)}
              </span>
            </Param>
            <Param label={t('transports.received')}>
              <span className="font-mono text-sky-400">{formatNumber(transport.received)}</span>
            </Param>
            <Param label={t('transports.lastPublish')}>
              <span className="font-mono">
                {formatTimestamp(transport.last_publish, t('common.never'))}
              </span>
            </Param>
            <Param label={t('transports.queueSize')}>
              <span className={`font-mono ${queueActive ? 'text-amber-400' : ''}`}>
                {formatNumber(transport.queue_size)}
              </span>
            </Param>
            <Param label={t('transports.droppedCommands')}>
              <span
                className={`font-mono ${transport.dropped_commands > 0 ? 'text-amber-400' : ''}`}
              >
                {formatNumber(transport.dropped_commands)}
              </span>
            </Param>
          </div>
        </CardContent>
      </Card>

      {/* Edit Configuration (hot-reload via PUT /configs) */}
      <TransportEditConfigSection transport={transport} key={transport.name} />
    </div>
  )
}
