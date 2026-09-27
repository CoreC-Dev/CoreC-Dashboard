import { dump } from 'js-yaml'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Database,
  Flame,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sliders,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useDriver, useDriverTags, useUpdateConfig } from '@/api/hooks'
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
import { ConnStateLabel, QualityLabel } from '@/lib/constants'
import { formatNumber, isZeroTime } from '@/lib/utils'
import type { DriverStatus } from '@/types/models'

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

// --- Driver Configuration Edit Section ---
// Renders a collapsible form that lets operators edit a driver's southbound
// connection parameters, preview the generated YAML and hot-reload it through
// PUT /configs (useUpdateConfig). Fields are derived from the driver protocol.

type DriverFieldKind = 'text' | 'number' | 'select'

interface DriverEditField {
  key: string
  labelKey: string
  kind: DriverFieldKind
  options?: readonly string[]
  placeholder?: string
}

const MODBUS_TCP_FIELDS: readonly DriverEditField[] = [
  { key: 'host', labelKey: 'drivers.editConfig.host', kind: 'text', placeholder: '192.168.1.100' },
  { key: 'port', labelKey: 'drivers.editConfig.port', kind: 'number', placeholder: '502' },
  { key: 'slave-id', labelKey: 'drivers.editConfig.slaveId', kind: 'number', placeholder: '1' },
  {
    key: 'tags-file',
    labelKey: 'drivers.editConfig.tagsFile',
    kind: 'text',
    placeholder: 'tags.yaml',
  },
]

const MODBUS_RTU_FIELDS: readonly DriverEditField[] = [
  {
    key: 'serial-device',
    labelKey: 'drivers.editConfig.serialDevice',
    kind: 'text',
    placeholder: '/dev/ttyS0',
  },
  {
    key: 'baud-rate',
    labelKey: 'drivers.editConfig.baudRate',
    kind: 'number',
    placeholder: '9600',
  },
  {
    key: 'data-bits',
    labelKey: 'drivers.editConfig.dataBits',
    kind: 'select',
    options: ['7', '8'],
  },
  {
    key: 'parity',
    labelKey: 'drivers.editConfig.parity',
    kind: 'select',
    options: ['none', 'even', 'odd'],
  },
  {
    key: 'stop-bits',
    labelKey: 'drivers.editConfig.stopBits',
    kind: 'select',
    options: ['1', '2'],
  },
  { key: 'slave-id', labelKey: 'drivers.editConfig.slaveId', kind: 'number', placeholder: '1' },
]

const S7_FIELDS: readonly DriverEditField[] = [
  { key: 'host', labelKey: 'drivers.editConfig.host', kind: 'text', placeholder: '192.168.1.10' },
  { key: 'rack', labelKey: 'drivers.editConfig.rack', kind: 'number', placeholder: '0' },
  { key: 'slot', labelKey: 'drivers.editConfig.slot', kind: 'number', placeholder: '1' },
]

const OPCUA_FIELDS: readonly DriverEditField[] = [
  {
    key: 'endpoint',
    labelKey: 'drivers.editConfig.endpoint',
    kind: 'text',
    placeholder: 'opc.tcp://192.168.1.20:4840',
  },
  {
    key: 'security-policy',
    labelKey: 'drivers.editConfig.securityPolicy',
    kind: 'select',
    options: [
      'None',
      'Basic128Rsa15',
      'Basic256',
      'Basic256Sha256',
      'Aes128Sha256RsaOaep',
      'Aes256Sha256RsaPss',
    ],
  },
  {
    key: 'security-mode',
    labelKey: 'drivers.editConfig.securityMode',
    kind: 'select',
    options: ['None', 'Sign', 'SignAndEncrypt'],
  },
]

function getDriverFields(type: string): readonly DriverEditField[] {
  const lower = type.toLowerCase()
  if (lower.includes('modbus')) {
    if (lower.includes('tcp') || lower.includes('tls')) return MODBUS_TCP_FIELDS
    if (lower.includes('rtu') || lower.includes('udp')) return MODBUS_RTU_FIELDS
    return MODBUS_TCP_FIELDS
  }
  if (lower.includes('s7')) return S7_FIELDS
  if (lower.includes('opcua') || lower.includes('opc-ua') || lower.includes('opc_ua'))
    return OPCUA_FIELDS
  return []
}

function buildDriverSettings(
  fields: readonly DriverEditField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {}
  for (const f of fields) {
    const raw = (values[f.key] ?? '').trim()
    if (raw === '') continue
    if (f.kind === 'number') {
      const n = Number(raw)
      settings[f.key] = Number.isNaN(n) ? raw : n
    } else {
      settings[f.key] = raw
    }
  }
  return settings
}

function buildDriverYaml(
  driver: DriverStatus,
  fields: readonly DriverEditField[],
  values: Record<string, string>,
): string {
  const settings = buildDriverSettings(fields, values)
  const doc = {
    drivers: [{ name: driver.name, type: driver.type, settings }],
  }
  return dump(doc, { skipInvalid: true, noRefs: true, lineWidth: -1 })
}

const DriverEditConfigSection: React.FC<{ driver: DriverStatus }> = ({ driver }) => {
  const { t } = useTranslation()
  const updateConfig = useUpdateConfig()
  const [open, setOpen] = useState(false)
  const fields = useMemo(() => getDriverFields(driver.type), [driver.type])
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) init[f.key] = ''
    return init
  })
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  const generatedYaml = useMemo(
    () => buildDriverYaml(driver, fields, values),
    [driver, fields, values],
  )

  const setField = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const handleGenerateAndReload = async () => {
    setStatusMsg(null)
    try {
      await updateConfig.mutateAsync({ payload: generatedYaml })
      setStatusMsg({ type: 'success', text: t('drivers.editConfig.reloadSuccess') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setStatusMsg({
        type: 'error',
        text: msg || t('drivers.editConfig.reloadFailed'),
      })
    }
  }

  return (
    <Card className="bg-card/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          <div>
            <CardTitle className="text-sm font-semibold">{t('drivers.editConfig.title')}</CardTitle>
            <CardDescription>{t('drivers.editConfig.description')}</CardDescription>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => setOpen((o) => !o)}
          aria-label={t('drivers.editConfig.toggle')}
          aria-expanded={open}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {fields.length === 0 ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-400">
              {t('drivers.editConfig.unsupportedProtocol')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
                {fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <label
                      htmlFor={`driver-field-${f.key}`}
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      {t(f.labelKey)}
                    </label>
                    {f.kind === 'select' && f.options ? (
                      <Select value={values[f.key] ?? ''} onValueChange={(v) => setField(f.key, v)}>
                        <SelectTrigger id={`driver-field-${f.key}`} className="h-9 text-xs">
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
                        id={`driver-field-${f.key}`}
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
                  {t('drivers.editConfig.yamlPreview')}
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
                      ? t('drivers.editConfig.reloading')
                      : t('drivers.editConfig.generateAndReload')}
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

export const DriverDetailPage: React.FC = () => {
  const { t } = useTranslation()
  const { name } = useParams<{ name: string }>()
  const { data: driver, isLoading, error, refetch, isFetching } = useDriver(name ?? '')
  const { data: tagsData, isLoading: tagsLoading } = useDriverTags(name ?? '')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <BackLink to="/admin/drivers">
          {t('drivers.driverList', { defaultValue: 'Back to Drivers' })}
        </BackLink>
        <div className="py-16 text-center text-xs text-muted-foreground">
          {t('common.loading', { defaultValue: 'Loading driver...' })}
        </div>
      </div>
    )
  }

  if (error || !driver) {
    return (
      <div className="space-y-6">
        <BackLink to="/admin/drivers">
          {t('drivers.driverList', { defaultValue: 'Back to Drivers' })}
        </BackLink>
        <Card className="border-dashed bg-card/40">
          <CardContent className="space-y-2 p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <div className="text-sm font-semibold">{t('drivers.detailNotFound')}</div>
            <div className="text-xs text-muted-foreground">
              {name ? t('drivers.notRegistered', { name }) : t('drivers.noNameProvided')}
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

  const st = ConnStateLabel[driver.state] ?? ConnStateLabel[0]
  // Unknown drivers return {"tags": null} (not 404); treat null/empty as "no tags".
  const tags = tagsData?.tags ? Object.values(tagsData.tags) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink to="/admin/drivers">
          {t('drivers.driverList', { defaultValue: 'Back to Drivers' })}
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
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">{driver.name}</CardTitle>
              <CardDescription className="font-mono text-[11px]">{driver.type}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
            {t(st.key)}
          </Badge>
        </CardHeader>
      </Card>

      {/* Error / Reconnect / Read stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t('drivers.totalErrors')}
          value={formatNumber(driver.error_count)}
          icon={<AlertCircle className="h-5 w-5 text-rose-400" />}
          accent="border border-rose-500/20 bg-rose-500/10"
        />
        <StatCard
          label={t('drivers.reconnectFailures')}
          value={formatNumber(driver.reconnect_count)}
          icon={<RotateCcw className="h-5 w-5 text-amber-400" />}
          accent="border border-amber-500/20 bg-amber-500/10"
        />
        <StatCard
          label={t('drivers.totalReads')}
          value={formatNumber(driver.read_count)}
          icon={<Database className="h-5 w-5 text-sky-400" />}
          accent="border border-sky-500/20 bg-sky-500/10"
        />
      </div>

      {/* Connection & runtime parameters */}
      <Card className="bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-primary" />
            {t('drivers.connectionRuntimeParams')}
          </CardTitle>
          <CardDescription>{t('drivers.connectionRuntimeDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
            <Param label={t('drivers.driverName')}>
              <span className="font-mono">{driver.name}</span>
            </Param>
            <Param label={t('drivers.protocolType')}>
              <span className="font-mono">{driver.type}</span>
            </Param>
            <Param label={t('drivers.connectionState')}>
              <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
                {t(st.key)}
              </Badge>
            </Param>
            <Param label={t('drivers.lastRead')}>
              <span className="font-mono">
                {formatTimestamp(driver.last_read, t('common.never'))}
              </span>
            </Param>
            <Param label={t('drivers.tagCount')}>
              <span className="font-mono">{formatNumber(driver.tag_count)}</span>
            </Param>
            <Param label={t('drivers.readCount')}>
              <span className="font-mono">{formatNumber(driver.read_count)}</span>
            </Param>
            <Param label={t('drivers.errorCount')}>
              <span className={`font-mono ${driver.error_count > 0 ? 'text-rose-400' : ''}`}>
                {formatNumber(driver.error_count)}
              </span>
            </Param>
            <Param label={t('drivers.reconnectCount')}>
              <span className={`font-mono ${driver.reconnect_count > 0 ? 'text-amber-400' : ''}`}>
                {formatNumber(driver.reconnect_count)}
              </span>
            </Param>
          </div>

          {driver.last_error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="mb-0.5 text-xs font-semibold">{t('drivers.lastError')}</div>
                <div className="break-all font-mono text-[11px]">{driver.last_error}</div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">{t('drivers.noRecentErrors')}</div>
          )}
        </CardContent>
      </Card>

      {/* Edit Configuration (hot-reload via PUT /configs) */}
      <DriverEditConfigSection driver={driver} key={driver.name} />

      {/* Tag values table */}
      <Card className="bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-primary" />
            {t('drivers.tagValuesTitle')}
          </CardTitle>
          <CardDescription>{t('drivers.tagValuesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {tagsLoading ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {t('drivers.loadingTagValues')}
            </div>
          ) : tags.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {t('drivers.noTagValues', { driver: driver.name })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/60 text-[10px] uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('common.tag')}</th>
                    <th className="px-3 py-2">{t('common.value')}</th>
                    <th className="px-3 py-2">{t('common.type')}</th>
                    <th className="px-3 py-2">{t('common.quality')}</th>
                    <th className="px-3 py-2">{t('common.timestamp')}</th>
                    <th className="px-3 py-2">{t('common.stale')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {/* Cap rendered rows at 200 to avoid DOM bloat for drivers
                      with thousands of tags. Use TagExplorer for full virtualized
                      browsing of large tag sets. */}
                  {tags.slice(0, 200).map((tag) => {
                    const q = QualityLabel[tag.quality] ?? QualityLabel[0]
                    return (
                      <tr key={tag.tag} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-semibold">{tag.tag}</td>
                        <td className="px-3 py-2 font-mono font-bold text-foreground">
                          {String(tag.value)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {tag.type}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`h-4 py-0 text-[9px] ${q.color}`}>
                            {t(q.key)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {tag.timestamp ? formatTimestamp(tag.timestamp) : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {tag.is_stale ? (
                            <Badge
                              variant="outline"
                              className="h-4 py-0 text-[9px] border-amber-500/30 bg-amber-500/10 text-amber-400"
                            >
                              {t('common.stale')}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-4 py-0 text-[9px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            >
                              {t('common.fresh')}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {tags.length > 200 && (
                <div className="border-t border-border bg-muted/40 px-3 py-2 text-center text-[11px] text-muted-foreground">
                  {t('drivers.showingFirstTags', { count: tags.length })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
