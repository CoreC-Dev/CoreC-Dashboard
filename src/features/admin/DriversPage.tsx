import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Cpu, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfigRaw, useDrivers, useDriverTags } from '@/api/hooks'
import { DeleteEntityConfirm } from '@/components/admin/DeleteEntityConfirm'
import { ConnectionSummary } from '@/components/admin/DetailPageParts'
import { SeedBlockedBanner } from '@/components/admin/SeedBlockedBanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { EntitySearchBar, filterEntities } from '@/components/wizard/EntitySearchBar'
import { UnsavedChangesBanner } from '@/components/wizard/UnsavedChangesBanner'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { DriverWizard } from '@/features/admin/DriverWizard'
import { useApplyConfig } from '@/hooks/useApplyConfig'
import { useAutoLoadConfig } from '@/hooks/useAutoLoadConfig'
import {
  formatValidationErrors,
  formatValidationWarnings,
  useConfigValidation,
} from '@/hooks/useConfigValidation'
import { useEntityListPage } from '@/hooks/useEntityListPage'
import { useParsedConfig } from '@/hooks/useParsedConfig'
import { jsonDeepEqual } from '@/lib/configHelpers'
import { getDriverConnectionSummary } from '@/lib/connectionInfo'
import { ConnStateLabel, QualityLabel } from '@/lib/constants'
import { rulesDependingOnDriver, unionRulesForDependencyScan } from '@/lib/ruleDependencies'
import { formatNumber, isZeroTime } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import type { DriverConfig } from '@/types/config'
import type { DriverStatus } from '@/types/models'

export const DriversPage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const adminBase = id ? `/corec/${id}/admin` : '/admin'
  const queryClient = useQueryClient()
  const { data, refetch, isFetching, isLoading, isError, error } = useDrivers()
  const [selectedDriver, setSelectedDriver] = useState<DriverStatus | null>(null)
  const { data: rawYaml } = useConfigRaw()
  const parsedConfig = useParsedConfig(rawYaml)

  // Config editing state
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const savedConfig = useConfigStore((s) => s.savedConfig)
  const dirty = useConfigStore((s) => s.dirty)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const removeDriver = useConfigStore((s) => s.removeDriver)
  const findDriver = useConfigStore((s) => s.findDriver)
  const getWorkingYaml = useConfigStore((s) => s.getWorkingYaml)
  const getSavedYaml = useConfigStore((s) => s.getSavedYaml)
  const markSaved = useConfigStore((s) => s.markSaved)
  const validation = useConfigValidation()
  const validationErrors = formatValidationErrors(validation)
  const validationWarnings = formatValidationWarnings(validation)

  const [searchQuery, setSearchQuery] = useState('')

  // D-16/X4: while the server config has never been loaded (auto-seed in
  // flight or failed, no baseline), Create must stay disabled — and the
  // block must be VISIBLE, not a silently dead button.
  const { seedBlocked } = useAutoLoadConfig()

  const { openDialog: openApplyDialog, dialogProps: applyDialogProps } = useApplyConfig({
    getWorkingYaml,
    getSavedYaml,
    markSaved,
    validationErrors,
    validationWarnings,
    onApplySuccess: () => queryClient.invalidateQueries({ queryKey: ['drivers'] }),
  })

  const {
    wizardOpen,
    setWizardOpen,
    editing: editingDriver,
    deleteTarget,
    setDeleteTarget,
    handleCreate,
    handleEdit,
    handleDelete,
    confirmDelete,
  } = useEntityListPage<DriverConfig>({
    find: findDriver,
    remove: removeDriver,
    resetToEmpty,
    hasWorkingConfig: !!workingConfig,
  })

  const drivers = data?.drivers || []

  // Config drivers (from working config, may differ from runtime)
  const configDrivers = workingConfig?.drivers ?? []
  const filteredConfigDrivers = filterEntities(configDrivers, searchQuery)

  // Precompute connection summaries once per config change instead of
  // recomputing inside every .map() iteration (TD-PERF-008).
  const workingDriverConnSummaries = useMemo(() => {
    const m = new Map<string, string>()
    for (const drv of workingConfig?.drivers ?? []) {
      m.set(drv.name, getDriverConnectionSummary(workingConfig, drv.name))
    }
    return m
  }, [workingConfig])
  const parsedDriverConnSummaries = useMemo(() => {
    const m = new Map<string, string>()
    for (const drv of drivers) m.set(drv.name, getDriverConnectionSummary(parsedConfig, drv.name))
    return m
  }, [parsedConfig, drivers])

  // C-A6: one page-header search bar covers BOTH zones — the runtime cards
  // filter by name/type/connection summary too, so an 80-driver site can
  // find plc-line3 without scrolling.
  const showSearch = configDrivers.length + drivers.length > 6
  const filteredRuntimeDrivers = filterEntities(
    drivers,
    searchQuery,
    (d) => parsedDriverConnSummaries.get(d.name) ?? '',
  )

  // C-A3: when deleting a driver, list the rules that lose their data
  // source — the match DSL is the only structural link between a rule
  // and a driver. Scans the working ∪ saved rule sets so pending
  // (unapplied) rules warn too, mirroring the TransportsPage template.
  const dependentDriverRules = useMemo(() => {
    if (!deleteTarget) return []
    const sources = unionRulesForDependencyScan(workingConfig, savedConfig)
    const driver =
      workingConfig?.drivers?.find((d) => d.name === deleteTarget) ??
      sources.allDrivers.find((d) => d.name === deleteTarget)
    if (!driver) return []
    return rulesDependingOnDriver({ driver, ...sources })
  }, [deleteTarget, workingConfig, savedConfig])

  // C-A7: the same driver appears in both zones with no way to tell
  // which card is "running" and which is "my unapplied edit". Badges:
  // working driver differs from the saved one (or is missing there) →
  // "pending changes"; runtime list contains the name → "live", else
  // "configured, not running". Same-name cards cross-link by anchor.
  const runtimeDriverNames = useMemo(() => new Set(drivers.map((d) => d.name)), [drivers])
  const hasPendingDriverChanges = useCallback(
    (name: string): boolean => {
      const w = workingConfig?.drivers?.find((d) => d.name === name)
      const s = savedConfig?.drivers?.find((d) => d.name === name)
      if (!w && !s) return false
      if (!w || !s) return true // added or deleted, not yet applied
      return !jsonDeepEqual(w, s)
    },
    [workingConfig, savedConfig],
  )
  const jumpToCard = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('drivers.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('drivers.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {showSearch && <EntitySearchBar value={searchQuery} onChange={setSearchQuery} />}
          {dirty && (
            <Button
              variant="default"
              size="sm"
              onClick={() => openApplyDialog()}
              disabled={!!validationErrors}
              className="h-8 text-xs shrink-0"
            >
              {t('drivers.applyChanges')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleCreate}
            disabled={seedBlocked}
            className="h-8 text-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>{t('drivers.createDriver')}</span>
          </Button>
        </div>
      </div>

      {/* D-16 — config seed failed/loading: explain why Create is disabled */}
      <SeedBlockedBanner />

      {/* Config editing banner — shows when there are unsaved config changes */}
      <UnsavedChangesBanner
        dirty={dirty}
        unsavedChangesLabel={t('drivers.unsavedChanges')}
        applyChangesLabel={t('drivers.applyChanges')}
        hasValidationErrors={!!validationErrors}
        onApply={() => openApplyDialog()}
        onDiscard={() => useConfigStore.getState().revert()}
      />

      {/* Live validation errors */}
      <ValidationBanner />

      {/* Config-managed drivers section (from working config) */}
      {configDrivers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('drivers.configSection')}
            </h2>
            <Badge variant="outline" className="text-xs">
              {configDrivers.length}
            </Badge>
          </div>
          {searchQuery && filteredConfigDrivers.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {t('common.noResults', { query: searchQuery }) || `No results for "${searchQuery}"`}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 card-stagger">
            {filteredConfigDrivers.map((drv) => (
              <Card
                key={drv.name}
                id={`cfg-driver-${drv.name}`}
                className="border-border bg-card card-enter scroll-mt-24"
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{drv.name}</CardTitle>
                        <CardDescription className="text-xs font-mono">{drv.type}</CardDescription>
                        <ConnectionSummary
                          summary={workingDriverConnSummaries.get(drv.name) ?? ''}
                        />
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {runtimeDriverNames.has(drv.name) ? (
                            <button
                              type="button"
                              onClick={() => jumpToCard(`runtime-driver-${drv.name}`)}
                              title={t('drivers.jumpToRuntime')}
                              aria-label={`${t('drivers.jumpToRuntime')} — ${drv.name}`}
                              className="inline-flex items-center gap-1 rounded-full border border-status-running/30 bg-status-running/10 px-2 py-0.5 text-xs text-status-running hover:bg-status-running/20 transition-colors"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-status-running" />
                              {t('drivers.zoneLive')}
                            </button>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                              {t('drivers.zoneConfigOnly')}
                            </span>
                          )}
                          {hasPendingDriverChanges(drv.name) && (
                            <span className="inline-flex items-center rounded-full border border-status-warning/30 bg-status-warning/10 px-2 py-0.5 text-xs text-status-warning dark:text-status-warning">
                              {t('drivers.zonePendingChanges')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(drv.name)}
                        className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                        title={t('common.edit')}
                        aria-label={t('common.edit')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(drv.name)}
                        className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                      <span className="text-muted-foreground">{t('drivers.tags')}</span>
                      <span className="font-mono font-bold">{drv.tags?.length ?? 0}</span>
                    </div>
                    {drv['tags-file'] && (
                      <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                        <span className="text-muted-foreground">{t('driverWizard.tagsFile')}</span>
                        <span className="font-mono truncate max-w-[100px]">{drv['tags-file']}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Runtime status section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t('drivers.runtimeSection')}
          </h2>
          <Badge variant="outline" className="text-xs">
            {drivers.length}
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 card-stagger">
          {isLoading && drivers.length === 0 ? (
            <LoadingState className="col-span-full py-12" />
          ) : isError ? (
            <Card className="col-span-full p-8 text-center space-y-3">
              <AlertCircle className="mx-auto h-8 w-8 text-status-error" />
              <div className="text-sm font-semibold">{t('common.error')}</div>
              {error instanceof Error && error.message && (
                <div className="mx-auto max-w-md break-all font-mono text-xs text-status-error/80">
                  {error.message}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
                {t('common.retry')}
              </Button>
            </Card>
          ) : drivers.length === 0 ? (
            // C-A8: the empty state points at the page's own Create
            // action instead of telling the operator to go edit YAML.
            <Card className="col-span-full p-8 text-center space-y-3 border-dashed">
              <p className="text-xs text-muted-foreground">{t('drivers.empty')}</p>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreate}
                  disabled={seedBlocked}
                  className="h-8 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  <span>{t('drivers.createDriver')}</span>
                </Button>
              </div>
            </Card>
          ) : filteredRuntimeDrivers.length === 0 ? (
            <Card className="col-span-full p-8 text-center text-xs text-muted-foreground border-dashed">
              {t('common.noResults', { query: searchQuery })}
            </Card>
          ) : (
            filteredRuntimeDrivers.map((drv) => {
              const st = ConnStateLabel[drv.state] || ConnStateLabel[0]
              return (
                <Card
                  key={drv.name}
                  id={`runtime-driver-${drv.name}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${drv.name} — ${st}`}
                  className="border-border bg-card card-enter hover:border-primary/40 transition-all cursor-pointer group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 scroll-mt-24"
                  onClick={() => navigate(`${adminBase}/drivers/${encodeURIComponent(drv.name)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`${adminBase}/drivers/${encodeURIComponent(drv.name)}`)
                    }
                  }}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold">{drv.name}</CardTitle>
                          <CardDescription className="text-xs font-mono">
                            {drv.type}
                          </CardDescription>
                          <ConnectionSummary
                            summary={parsedDriverConnSummaries.get(drv.name) ?? ''}
                          />
                          {hasPendingDriverChanges(drv.name) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                jumpToCard(`cfg-driver-${drv.name}`)
                              }}
                              title={t('drivers.jumpToConfig')}
                              aria-label={`${t('drivers.jumpToConfig')} — ${drv.name}`}
                              className="mt-1.5 inline-flex items-center rounded-full border border-status-warning/30 bg-status-warning/10 px-2 py-0.5 text-xs text-status-warning dark:text-status-warning hover:bg-status-warning/20 transition-colors"
                            >
                              {t('drivers.zonePendingChanges')}
                            </button>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-xs ${st.badgeColor}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${st.dotColor}`} />
                        {t(st.key)}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pt-2 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-lg bg-muted/40 border border-border text-xs">
                      <div>
                        <div className="text-muted-foreground text-xs">{t('drivers.tags')}</div>
                        <div className="font-mono font-bold">{drv.tag_count}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">{t('drivers.reads')}</div>
                        <div className="font-mono font-bold text-status-running">
                          {formatNumber(drv.read_count)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">{t('drivers.errors')}</div>
                        <div className="font-mono font-bold text-status-error">
                          {drv.error_count}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>{t('drivers.reconnectFailures')}</span>
                        <span className="font-mono font-medium text-foreground">
                          {drv.reconnect_count}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('drivers.lastRead')}</span>
                        <span className="font-mono text-foreground truncate max-w-[140px]">
                          {isZeroTime(drv.last_read)
                            ? t('drivers.never')
                            : new Date(drv.last_read).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    {drv.last_error && (
                      <div className="p-2 rounded bg-status-error/10 border border-status-error/20 text-status-error text-xs truncate flex items-center space-x-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{drv.last_error}</span>
                      </div>
                    )}

                    <div className="pt-1 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedDriver(drv)
                        }}
                        className="text-muted-foreground hover:text-primary hover:underline"
                      >
                        {t('drivers.viewTags')}
                      </button>
                      <div className="flex items-center text-primary group-hover:underline">
                        <span>{t('drivers.viewDetails')}</span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      {/* Driver Detail Drawer / Dialog */}
      {selectedDriver && (
        <DriverDetailDialog driver={selectedDriver} onClose={() => setSelectedDriver(null)} />
      )}

      {/* Create/Edit Driver Wizard */}
      <DriverWizard open={wizardOpen} onOpenChange={setWizardOpen} existingDriver={editingDriver} />

      {/* Delete Confirmation — lists rules that lose their data source (C-A3) */}
      <DeleteEntityConfirm
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('drivers.deleteTitle')}
        description={t('drivers.deleteConfirm', { name: deleteTarget ?? '' })}
        onConfirm={confirmDelete}
      >
        {dependentDriverRules.length > 0 && (
          <div className="rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-status-warning">
              <AlertCircle className="h-3.5 w-3.5" />
              {t('drivers.deleteDependentRules', { count: dependentDriverRules.length })}
            </div>
            <ul className="list-disc list-inside text-status-warning/80 space-y-0.5">
              {dependentDriverRules.slice(0, 10).map((r) => (
                <li key={r.name} className="font-mono">
                  {r.name} → {r.action}
                </li>
              ))}
              {dependentDriverRules.length > 10 && (
                <li className="italic">
                  {t('drivers.deleteAndMore', { count: dependentDriverRules.length - 10 })}
                </li>
              )}
            </ul>
            <p className="text-status-warning/70">{t('drivers.deleteDependentHint')}</p>
          </div>
        )}
      </DeleteEntityConfirm>

      {/* Apply Config Confirmation */}
      <ConfigApplyConfirmationDialog {...applyDialogProps} />
    </div>
  )
}

const DriverDetailDialog: React.FC<{
  driver: DriverStatus
  onClose: () => void
}> = ({ driver, onClose }) => {
  const { t } = useTranslation()
  const { data: tagsData, isLoading } = useDriverTags(driver.name)
  const tags = tagsData?.tags ? Object.values(tagsData.tags) : []
  // Cap rendered tags to prevent DOM overload (TD-PERF-001, aligns with DriverDetailPage).
  const MAX_TAGS = 200
  const visibleTags = tags.slice(0, MAX_TAGS)

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="text-base font-bold flex items-center space-x-2">
                <span>{driver.name}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {driver.type}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">{t('drivers.detailTitle')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pt-2">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {t('drivers.loadingTags')}
            </div>
          ) : tags.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {t('drivers.noTags', { driver: driver.name })}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/60 border-b border-border text-xs uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('drivers.colTag')}</th>
                    <th className="px-3 py-2">{t('drivers.colGroup')}</th>
                    <th className="px-3 py-2">{t('drivers.colValue')}</th>
                    <th className="px-3 py-2">{t('drivers.colType')}</th>
                    <th className="px-3 py-2">{t('drivers.colQuality')}</th>
                    <th className="px-3 py-2">{t('drivers.colLastPolled')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visibleTags.map((tag) => {
                    const q = QualityLabel[tag.quality] || QualityLabel[0]
                    return (
                      <tr key={tag.tag} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-semibold">{tag.tag}</td>
                        <td className="px-3 py-2 text-muted-foreground">{tag.group || '-'}</td>
                        <td className="px-3 py-2 font-mono font-bold text-foreground">
                          {String(tag.value)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{tag.type}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs py-0 h-4 ${q.color}`}>
                            {t(q.key)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                          {tag.timestamp ? new Date(tag.timestamp).toLocaleTimeString() : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {tags.length > MAX_TAGS && (
            <p className="text-xs text-muted-foreground text-center py-2">
              {t('common.showing', { shown: MAX_TAGS, total: tags.length })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
