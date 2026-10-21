import {
  AlertCircle,
  ChevronDown,
  Cpu,
  Database,
  FileCode2,
  GitBranch,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  useConfigRaw,
  useDriver,
  useDriverTags,
  usePauseDriver,
  usePausedDrivers,
  useResumeDriver,
} from '@/api/hooks'
import { BackLink, formatTimestamp, Param, StatCard } from '@/components/admin/DetailPageParts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { DriverEditConfigSection } from '@/features/admin/driverDetail/EditConfigSection'
import { useParsedConfig } from '@/hooks/useParsedConfig'
import { extractDriverYaml, getDriverConnectionFields } from '@/lib/connectionInfo'
import { ConnStateLabel, QualityLabel } from '@/lib/constants'
import { rulesDependingOnDriver } from '@/lib/ruleDependencies'
import { formatNumber } from '@/lib/utils'

// ─── Driver detail page ────────────────────────────────────────────────
// The quick-edit form + its helpers live in ./driverDetail/
// (D2, quality audit 2026-10-21 — the former 656-line page split by
// concern; behavior identical).

export const DriverDetailPage: React.FC = () => {
  const { t } = useTranslation()
  const { name, id } = useParams<{ name: string; id: string }>()
  const adminBase = id ? `/corec/${id}/admin` : '/admin'
  const { data: driver, isLoading, error, refetch, isFetching } = useDriver(name ?? '')
  const { data: tagsData, isLoading: tagsLoading } = useDriverTags(name ?? '')
  // Pause/resume collection (audit RES-4): scheduler-level switch, no
  // config round trip. Membership drives the button's verb + badge.
  const { data: pausedData } = usePausedDrivers()
  const pauseMut = usePauseDriver(name ?? '')
  const resumeMut = useResumeDriver(name ?? '')
  const paused = !!name && (pausedData?.paused?.includes(name) ?? false)
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
  // C-A11: rules whose match DSL consumes this driver's points — scanned
  // from the saved config this page renders. The config entry (with its
  // tag list) drives the scan; the runtime stat carries no tags.
  const relatedRules = useMemo(() => {
    if (!driver) return []
    const cfgDriver = config?.drivers?.find((d) => d.name === driver.name) ?? { name: driver.name }
    return rulesDependingOnDriver({
      driver: cfgDriver,
      allDrivers: config?.drivers ?? [],
      rules: config?.rules ?? [],
      groups: config?.['rule-groups'],
    })
  }, [config, driver])
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
  // C-A10: the truncated-tag note points at the real Tag Explorer (the
  // monitor route), pre-filtered to this driver — the old copy named a page
  // that had no link or button anywhere on this page.
  const tagExplorerTo = id
    ? `/corec/${id}/monitor/tags?driver=${encodeURIComponent(driver.name)}`
    : null

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
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${st.badgeColor}`}>
              <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
              {t(st.key)}
            </Badge>
            {paused && (
              <Badge variant="secondary" className="text-xs">
                {t('drivers.pausedBadge')}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => (paused ? resumeMut.mutate() : pauseMut.mutate())}
              disabled={pauseMut.isPending || resumeMut.isPending}
              aria-label={t(paused ? 'drivers.resumeAria' : 'drivers.pauseAria', {
                name: driver.name,
              })}
              title={t(paused ? 'drivers.resumeDesc' : 'drivers.pauseDesc')}
            >
              {paused ? (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Pause className="mr-1.5 h-3.5 w-3.5" />
              )}
              <span>{t(paused ? 'drivers.resume' : 'drivers.pause')}</span>
            </Button>
          </div>
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

      {/* C-A11: rules consuming this driver's data — the detail page is the
          natural "where does this driver's data go?" surface, and the only
          structural link between a rule and a driver is its match DSL, so
          the scan reuses the C-A3 dependency scanner over the SAVED config
          (this page renders server state, not the working draft). */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-status-warning" />
            {t('drivers.relatedRulesTitle', { count: relatedRules.length })}
          </CardTitle>
          <CardDescription>{t('drivers.relatedRulesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {relatedRules.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t('drivers.noRelatedRules')}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {relatedRules.slice(0, 10).map((r) => (
                <Link
                  key={r.name}
                  to={`${adminBase}/rules`}
                  className="rounded-lg border border-status-warning/30 bg-status-warning/5 px-2.5 py-1.5 font-mono text-xs text-foreground transition-colors hover:border-status-warning/60 hover:underline"
                >
                  {r.name}
                  <span className="ml-1.5 text-muted-foreground">→ {r.action}</span>
                </Link>
              ))}
              {relatedRules.length > 10 && (
                <span className="self-center text-xs italic text-muted-foreground">
                  {t('drivers.deleteAndMore', { count: relatedRules.length - 10 })}
                </span>
              )}
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
              <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
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
              {tags.length > 200 &&
                (tagExplorerTo ? (
                  <Link
                    to={tagExplorerTo}
                    className="block border-t border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
                  >
                    {t('drivers.showingFirstTags', { count: tags.length })}
                  </Link>
                ) : (
                  <div className="border-t border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
                    {t('drivers.showingFirstTags', { count: tags.length })}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
