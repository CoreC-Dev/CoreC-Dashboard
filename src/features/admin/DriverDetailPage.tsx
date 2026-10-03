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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useConfigRaw, useDriver, useDriverTags } from '@/api/hooks'
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
import { LoadingState } from '@/components/ui/loading-state'
import { useEntityEditConfig } from '@/hooks/useEntityEditConfig'
import { useParsedConfig } from '@/hooks/useParsedConfig'
import { dumpConfigYaml, parseConfigYaml, upsertDriver } from '@/lib/configYaml'
import { extractDriverYaml, getDriverConnectionFields } from '@/lib/connectionInfo'
import { ConnStateLabel, QualityLabel } from '@/lib/constants'
import { type RegistryEditField, registryToEditFields } from '@/lib/registryAdapter'
import { DRIVER_TOPLEVEL_FIELDS, getDriverFieldRegistry } from '@/lib/settingsRegistry'
import { formatNumber } from '@/lib/utils'
import type { CoreCConfig, DriverConfig } from '@/types/config'
import type { DriverStatus } from '@/types/models'

// --- Driver Configuration Edit Section ---
// Renders a collapsible form that lets operators edit a driver's southbound
// connection parameters, preview the generated YAML and hot-reload it through
// PUT /configs (useUpdateConfig). Field metadata is derived from the settings
// registry (single source of truth — TD-ARCH-011/TD-DUP-001) via the
// registryToEditFields adapter; no local field arrays are duplicated here.

/** Resolve the edit fields for a driver type from the settings registry. */
function getDriverFields(type: string): readonly RegistryEditField[] {
  return registryToEditFields(getDriverFieldRegistry(type), DRIVER_TOPLEVEL_FIELDS)
}

/** Serialize an existing config value into the string form the edit form uses.
 *  Objects are JSON-stringified (not `[object Object]`) so they round-trip
 *  correctly if a future driver field is a nested map. [C-2] */
function driverConfigValueToString(src: unknown): string {
  if (src === undefined || src === null) return ''
  if (typeof src === 'object') return JSON.stringify(src)
  return String(src)
}

/** Build a driver entry ({ name, type, settings, ...top-level }) from the edit
 *  form values. Fields tagged `group: 'settings'` go inside `settings`; fields
 *  tagged `group: 'top'` (e.g. tags-file, tags-interval) are placed as
 *  top-level siblings — matching configSchema + the wizard (bug fix: the
 *  previous local arrays wrote tags-file inside `settings`). */
function buildDriverEntry(
  driver: DriverStatus,
  fields: readonly RegistryEditField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {}
  const entry: Record<string, unknown> = { name: driver.name, type: driver.type }
  for (const f of fields) {
    const raw = (values[f.key] ?? '').trim()
    if (raw === '') continue
    const val = f.kind === 'number' ? (Number.isNaN(Number(raw)) ? raw : Number(raw)) : raw
    if (f.group === 'settings') settings[f.key] = val
    else entry[f.key] = val
  }
  if (Object.keys(settings).length > 0) entry.settings = settings
  return entry
}

function buildDriverYaml(
  driver: DriverStatus,
  fields: readonly RegistryEditField[],
  values: Record<string, string>,
): string {
  return dump(
    { drivers: [buildDriverEntry(driver, fields, values)] },
    { skipInvalid: true, noRefs: true, lineWidth: -1 },
  )
}

const DriverEditConfigSection: React.FC<{ driver: DriverStatus }> = ({ driver }) => {
  const { t } = useTranslation()
  const fields = useMemo(() => getDriverFields(driver.type), [driver.type])

  const prefillValues = useCallback(
    (cfg: CoreCConfig): Record<string, string> | null => {
      const me = cfg.drivers?.find((d) => d.name === driver.name)
      if (!me) return null
      const init: Record<string, string> = {}
      for (const f of fields) {
        // Top-level fields (tags-file, tags-interval) live on the driver entry;
        // settings fields live inside `settings`.
        const src =
          f.group === 'settings'
            ? me.settings?.[f.key]
            : (me as unknown as Record<string, unknown>)[f.key]
        init[f.key] = driverConfigValueToString(src)
      }
      return init
    },
    [driver.name, fields],
  )

  const buildPreviewYaml = useCallback(
    (flds: readonly RegistryEditField[], vals: Record<string, string>) =>
      buildDriverYaml(driver, flds, vals),
    [driver],
  )

  const buildApplyYaml = useCallback(
    (raw: string, flds: readonly RegistryEditField[], vals: Record<string, string>): string => {
      const fullConfig = parseConfigYaml(raw)
      const existing = fullConfig.drivers?.find((d) => d.name === driver.name)
      const built = buildDriverEntry(driver, flds, vals)
      // Merge the edited settings + top-level fields onto the existing driver
      // (preserving its tags etc.), or create a fresh one with empty tags.
      const updatedDriver: DriverConfig = existing
        ? {
            ...existing,
            ...built,
            settings: { ...(existing.settings ?? {}), ...(built.settings ?? {}) },
          }
        : {
            name: driver.name,
            type: driver.type,
            settings: (built.settings as Record<string, unknown>) ?? {},
            tags: [],
          }
      return dumpConfigYaml(upsertDriver(fullConfig, updatedDriver))
    },
    [driver],
  )

  const edit = useEntityEditConfig<RegistryEditField>({
    entityName: driver.name,
    fields,
    prefillValues,
    buildPreviewYaml,
    buildApplyYaml,
    successKey: 'drivers.editConfig.reloadSuccess',
    failureKey: 'drivers.editConfig.reloadFailed',
  })

  return (
    <EntityEditConfigCard
      edit={edit}
      fields={fields}
      fieldIdPrefix="driver-field-"
      labelFor={(f) => t(f.labelKey)}
      labels={{
        title: t('drivers.editConfig.title'),
        description: t('drivers.editConfig.description'),
        toggleAriaLabel: t('drivers.editConfig.toggle'),
        unsupportedMessage: t('drivers.editConfig.unsupportedProtocol'),
        yamlPreviewLabel: t('drivers.editConfig.yamlPreview'),
        reloadingLabel: t('drivers.editConfig.reloading'),
        reloadButtonLabel: t('drivers.editConfig.generateAndReload'),
      }}
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
      <div className="space-y-5">
        <BackLink to={`${adminBase}/drivers`}>
          {t('drivers.driverList', { defaultValue: 'Back to Drivers' })}
        </BackLink>
        <LoadingState text={t('common.loading', { defaultValue: 'Loading driver...' })} />
      </div>
    )
  }

  if (error || !driver) {
    return (
      <div className="space-y-5">
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
    <div className="space-y-5">
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
