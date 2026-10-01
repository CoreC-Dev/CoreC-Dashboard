import { dump } from 'js-yaml'
import {
  AlertCircle,
  ChevronDown,
  Cpu,
  Database,
  FileCode2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useConfigRaw, useDriver, useDriverTags, useUpdateConfig } from '@/api/hooks'
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
import { parseConfigYaml } from '@/lib/configYaml'
import { extractDriverYaml, getDriverConnectionFields } from '@/lib/connectionInfo'
import { ConnStateLabel, QualityLabel } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import type { DriverStatus } from '@/types/models'

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
  { key: 'timeout', labelKey: 'drivers.editConfig.timeout', kind: 'text', placeholder: '5s' },
  { key: 'retry', labelKey: 'drivers.editConfig.retry', kind: 'number', placeholder: '3' },
  {
    key: 'reconnect-interval',
    labelKey: 'drivers.editConfig.reconnectInterval',
    kind: 'text',
    placeholder: '1s',
  },
  {
    key: 'reconnect-max-interval',
    labelKey: 'drivers.editConfig.reconnectMaxInterval',
    kind: 'text',
    placeholder: '30s',
  },
  {
    key: 'max-reconnect-failures',
    labelKey: 'drivers.editConfig.maxReconnectFailures',
    kind: 'number',
    placeholder: '10',
  },
  {
    key: 'tags-file',
    labelKey: 'drivers.editConfig.tagsFile',
    kind: 'text',
    placeholder: 'tags.yaml',
  },
  {
    key: 'tags-interval',
    labelKey: 'drivers.editConfig.tagsInterval',
    kind: 'text',
    placeholder: '1s',
  },
]

const MODBUS_TLS_FIELDS: readonly DriverEditField[] = [
  { key: 'host', labelKey: 'drivers.editConfig.host', kind: 'text', placeholder: '192.168.1.100' },
  { key: 'port', labelKey: 'drivers.editConfig.port', kind: 'number', placeholder: '502' },
  { key: 'slave-id', labelKey: 'drivers.editConfig.slaveId', kind: 'number', placeholder: '1' },
  { key: 'timeout', labelKey: 'drivers.editConfig.timeout', kind: 'text', placeholder: '5s' },
  {
    key: 'cert-file',
    labelKey: 'drivers.editConfig.certFile',
    kind: 'text',
    placeholder: '/path/to/cert.pem',
  },
  {
    key: 'key-file',
    labelKey: 'drivers.editConfig.keyFile',
    kind: 'text',
    placeholder: '/path/to/key.pem',
  },
  {
    key: 'ca-file',
    labelKey: 'drivers.editConfig.caFile',
    kind: 'text',
    placeholder: '/path/to/ca.pem',
  },
  {
    key: 'tags-file',
    labelKey: 'drivers.editConfig.tagsFile',
    kind: 'text',
    placeholder: 'tags.yaml',
  },
  {
    key: 'tags-interval',
    labelKey: 'drivers.editConfig.tagsInterval',
    kind: 'text',
    placeholder: '1s',
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
  {
    key: 'tags-file',
    labelKey: 'drivers.editConfig.tagsFile',
    kind: 'text',
    placeholder: 'tags.yaml',
  },
  {
    key: 'tags-interval',
    labelKey: 'drivers.editConfig.tagsInterval',
    kind: 'text',
    placeholder: '1s',
  },
]

const S7_FIELDS: readonly DriverEditField[] = [
  { key: 'host', labelKey: 'drivers.editConfig.host', kind: 'text', placeholder: '192.168.1.10' },
  { key: 'port', labelKey: 'drivers.editConfig.port', kind: 'number', placeholder: '102' },
  { key: 'rack', labelKey: 'drivers.editConfig.rack', kind: 'number', placeholder: '0' },
  { key: 'slot', labelKey: 'drivers.editConfig.slot', kind: 'number', placeholder: '1' },
  {
    key: 'idle-timeout',
    labelKey: 'drivers.editConfig.idleTimeout',
    kind: 'text',
    placeholder: '30s',
  },
  { key: 'timeout', labelKey: 'drivers.editConfig.timeout', kind: 'text', placeholder: '5s' },
  {
    key: 'tags-file',
    labelKey: 'drivers.editConfig.tagsFile',
    kind: 'text',
    placeholder: 'tags.yaml',
  },
  {
    key: 'tags-interval',
    labelKey: 'drivers.editConfig.tagsInterval',
    kind: 'text',
    placeholder: '1s',
  },
]

const OPCUA_FIELDS: readonly DriverEditField[] = [
  {
    key: 'endpoint',
    labelKey: 'drivers.editConfig.endpoint',
    kind: 'text',
    placeholder: 'opc.tcp://192.168.1.20:4840',
  },
  {
    key: 'mode',
    labelKey: 'drivers.editConfig.mode',
    kind: 'select',
    options: ['polling', 'subscription'],
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
  { key: 'username', labelKey: 'drivers.editConfig.username', kind: 'text' },
  { key: 'password', labelKey: 'drivers.editConfig.password', kind: 'text' },
  {
    key: 'subscription-interval',
    labelKey: 'drivers.editConfig.subscriptionInterval',
    kind: 'text',
    placeholder: '500ms',
  },
  {
    key: 'subscription-buffer',
    labelKey: 'drivers.editConfig.subscriptionBuffer',
    kind: 'number',
    placeholder: '100',
  },
  {
    key: 'max-batch-size',
    labelKey: 'drivers.editConfig.maxBatchSize',
    kind: 'number',
    placeholder: '1000',
  },
  {
    key: 'cert-file',
    labelKey: 'drivers.editConfig.certFile',
    kind: 'text',
    placeholder: '/path/to/cert.pem',
  },
  {
    key: 'key-file',
    labelKey: 'drivers.editConfig.keyFile',
    kind: 'text',
    placeholder: '/path/to/key.pem',
  },
  { key: 'timeout', labelKey: 'drivers.editConfig.timeout', kind: 'text', placeholder: '5s' },
  {
    key: 'tags-file',
    labelKey: 'drivers.editConfig.tagsFile',
    kind: 'text',
    placeholder: 'tags.yaml',
  },
  {
    key: 'tags-interval',
    labelKey: 'drivers.editConfig.tagsInterval',
    kind: 'text',
    placeholder: '1s',
  },
]

function getDriverFields(type: string): readonly DriverEditField[] {
  const lower = type.toLowerCase()
  if (lower.includes('modbus')) {
    if (lower.includes('tls')) return MODBUS_TLS_FIELDS
    // Pure serial RTU (not RTU-over-TCP/UDP) uses serial fields.
    if (lower.includes('rtu') && !lower.includes('over')) return MODBUS_RTU_FIELDS
    // tcp, udp, rtuovertcp, rtuoverudp → TCP-style host/port fields.
    return MODBUS_TCP_FIELDS
  }
  if (lower.includes('s7')) return S7_FIELDS
  if (lower.includes('opcua') || lower.includes('opc-ua') || lower.includes('opc_ua'))
    return OPCUA_FIELDS
  return []
}

/** Serialize an existing config value into the string form the edit form uses.
 *  Objects are JSON-stringified (not `[object Object]`) so they round-trip
 *  correctly if a future driver field is a nested map. [C-2] */
function driverConfigValueToString(src: unknown): string {
  if (src === undefined || src === null) return ''
  if (typeof src === 'object') return JSON.stringify(src)
  return String(src)
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
  const { data: rawYaml } = useConfigRaw()
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

  // Pre-fill form from the existing server config so the operator can see and
  // preserve current settings instead of starting from empty inputs. [C-2]
  // Secrets come back redacted as "***" and must be re-entered — that is an
  // inherent limitation of the redacted raw view.
  useEffect(() => {
    if (!rawYaml) return
    try {
      const cfg = parseConfigYaml(rawYaml)
      const me = cfg.drivers?.find((d) => d.name === driver.name)
      if (!me?.settings) return
      setValues((prev) => {
        const init = { ...prev }
        for (const f of fields) {
          const src = me.settings?.[f.key]
          init[f.key] = driverConfigValueToString(src)
        }
        return init
      })
    } catch {
      // If YAML parse fails, leave the form empty — don't crash the page.
    }
  }, [rawYaml, driver.name, fields])

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
    <EntityEditConfigCard
      title={t('drivers.editConfig.title')}
      description={t('drivers.editConfig.description')}
      toggleAriaLabel={t('drivers.editConfig.toggle')}
      open={open}
      onToggleOpen={() => setOpen((o) => !o)}
      fields={fields}
      fieldIdPrefix="driver-field-"
      labelFor={(f) => t(f.labelKey)}
      values={values}
      onFieldChange={setField}
      unsupportedMessage={t('drivers.editConfig.unsupportedProtocol')}
      yamlPreviewLabel={t('drivers.editConfig.yamlPreview')}
      yamlPreview={generatedYaml}
      statusMsg={statusMsg}
      reloadingLabel={t('drivers.editConfig.reloading')}
      reloadButtonLabel={t('drivers.editConfig.generateAndReload')}
      isReloading={updateConfig.isPending}
      onReload={handleGenerateAndReload}
    />
  )
}

export const DriverDetailPage: React.FC = () => {
  const { t } = useTranslation()
  const { name, id } = useParams<{ name: string; id: string }>()
  const adminBase = id ? `/corec/${id}/admin` : '/admin'
  const { data: driver, isLoading, error, refetch, isFetching } = useDriver(name ?? '')
  const { data: tagsData, isLoading: tagsLoading } = useDriverTags(name ?? '')
  const { data: rawYaml } = useConfigRaw()
  const config = useParsedConfig(rawYaml)
  const connFields = useMemo(
    () => (driver ? getDriverConnectionFields(config, driver.name) : []),
    [config, driver],
  )
  const yamlSnippet = useMemo(
    () => (rawYaml && driver ? extractDriverYaml(rawYaml, driver.name) : ''),
    [rawYaml, driver],
  )
  const [yamlOpen, setYamlOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <BackLink to={`${adminBase}/drivers`}>
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
        <BackLink to={`${adminBase}/drivers`}>
          {t('drivers.driverList', { defaultValue: 'Back to Drivers' })}
        </BackLink>
        <Card className="border-dashed bg-card">
          <CardContent className="space-y-2 p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-status-error" />
            <div className="text-sm font-semibold">{t('drivers.detailNotFound')}</div>
            <div className="text-xs text-muted-foreground">
              {name ? t('drivers.notRegistered', { name }) : t('drivers.noNameProvided')}
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

  const st = ConnStateLabel[driver.state] ?? ConnStateLabel[0]
  // Unknown drivers return {"tags": null} (not 404); treat null/empty as "no tags".
  const tags = tagsData?.tags ? Object.values(tagsData.tags) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink to={`${adminBase}/drivers`}>
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
      <Card className="bg-card">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">{driver.name}</CardTitle>
              <CardDescription className="font-mono text-xs">{driver.type}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs ${st.badgeColor}`}>
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
          icon={<AlertCircle className="h-5 w-5 text-status-error" />}
          accent="border border-status-error/20 bg-status-error/10"
        />
        <StatCard
          label={t('drivers.reconnectFailures')}
          value={formatNumber(driver.reconnect_count)}
          icon={<RotateCcw className="h-5 w-5 text-status-warning" />}
          accent="border border-status-warning/20 bg-status-warning/10"
        />
        <StatCard
          label={t('drivers.totalReads')}
          value={formatNumber(driver.read_count)}
          icon={<Database className="h-5 w-5 text-primary" />}
          accent="border border-primary/20 bg-primary/10"
        />
      </div>

      {/* Connection & runtime parameters */}
      <Card className="bg-card">
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
              <Badge variant="outline" className={`text-xs ${st.badgeColor}`}>
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
              <span className={`font-mono ${driver.error_count > 0 ? 'text-status-error' : ''}`}>
                {formatNumber(driver.error_count)}
              </span>
            </Param>
            <Param label={t('drivers.reconnectCount')}>
              <span
                className={`font-mono ${driver.reconnect_count > 0 ? 'text-status-warning' : ''}`}
              >
                {formatNumber(driver.reconnect_count)}
              </span>
            </Param>
          </div>

          {driver.last_error ? (
            <div className="flex items-start gap-2 rounded-lg border border-status-error/20 bg-status-error/10 p-3 text-status-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="mb-0.5 text-xs font-semibold">{t('drivers.lastError')}</div>
                <div className="break-all font-mono text-xs">{driver.last_error}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">{t('drivers.noRecentErrors')}</div>
          )}
        </CardContent>
      </Card>

      {/* Connection Info (read-only, from current config) */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-primary" />
            {t('drivers.connectionInfo')}
          </CardTitle>
          <CardDescription>{t('drivers.connectionInfoDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {connFields.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t('drivers.noConnectionInfo')}</div>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {connFields.map((field) => (
                <div key={field.label} className="min-w-0 space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {field.label}
                  </div>
                  <div
                    className={`break-all font-mono text-xs ${field.primary ? 'font-bold text-foreground' : 'font-medium text-foreground/90'}`}
                  >
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current YAML snippet (read-only, collapsible) */}
      <Card className="bg-card">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-semibold">{t('drivers.currentYaml')}</CardTitle>
              <CardDescription>{t('drivers.currentYamlDesc')}</CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => setYamlOpen((o) => !o)}
            aria-label={t('drivers.currentYamlToggle')}
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
              <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-status-idle p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-status-idle">
                {yamlSnippet}
              </pre>
            ) : (
              <div className="text-xs text-muted-foreground">{t('drivers.noYaml')}</div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Edit Configuration (hot-reload via PUT /configs) */}
      <DriverEditConfigSection driver={driver} key={driver.name} />

      {/* Tag values table */}
      <Card className="bg-card">
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
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/60 text-xs uppercase font-semibold text-muted-foreground">
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
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {tag.type}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`h-4 py-0 text-xs ${q.color}`}>
                            {t(q.key)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {tag.timestamp ? formatTimestamp(tag.timestamp) : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {tag.is_stale ? (
                            <Badge
                              variant="outline"
                              className="h-4 py-0 text-xs border-status-warning/30 bg-status-warning/10 text-status-warning"
                            >
                              {t('common.stale')}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-4 py-0 text-xs border-status-running/30 bg-status-running/10 text-status-running"
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
                <div className="border-t border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
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
