import { AlertCircle, Cpu, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfigRaw, useDrivers, useDriverTags, useUpdateConfig } from '@/api/hooks'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { EntitySearchBar, filterEntities } from '@/components/wizard/EntitySearchBar'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { DriverWizard } from '@/features/admin/DriverWizard'
import { useConfigValidation } from '@/hooks/useConfigValidation'
import { useParsedConfig } from '@/hooks/useParsedConfig'
import { getDriverConnectionSummary } from '@/lib/connectionInfo'
import { ConnStateLabel, QualityLabel } from '@/lib/constants'
import { formatNumber, isZeroTime } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import type { DriverConfig } from '@/types/config'
import type { DriverStatus } from '@/types/models'

export const DriversPage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const adminBase = id ? `/corec/${id}/admin` : '/admin'
  const { data, refetch, isFetching } = useDrivers()
  const [selectedDriver, setSelectedDriver] = useState<DriverStatus | null>(null)
  const { data: rawYaml } = useConfigRaw()
  const parsedConfig = useParsedConfig(rawYaml)

  // Config editing state
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const dirty = useConfigStore((s) => s.dirty)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const removeDriver = useConfigStore((s) => s.removeDriver)
  const findDriver = useConfigStore((s) => s.findDriver)
  const getWorkingYaml = useConfigStore((s) => s.getWorkingYaml)
  const getSavedYaml = useConfigStore((s) => s.getSavedYaml)
  const markSaved = useConfigStore((s) => s.markSaved)
  const validation = useConfigValidation()
  const validationErrors =
    validation.hasConfig && !validation.valid
      ? validation.errors.map((e) => `${e.path}: ${e.message}`)
      : undefined

  const updateConfig = useUpdateConfig()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingDriver, setEditingDriver] = useState<DriverConfig | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const drivers = data?.drivers || []

  // Config drivers (from working config, may differ from runtime)
  const configDrivers = workingConfig?.drivers ?? []
  const filteredConfigDrivers = filterEntities(configDrivers, searchQuery)

  const handleCreate = () => {
    if (!workingConfig) {
      resetToEmpty()
    }
    setEditingDriver(undefined)
    setWizardOpen(true)
  }

  const handleEdit = (name: string) => {
    const drv = findDriver(name)
    if (!drv) return
    setEditingDriver(drv)
    setWizardOpen(true)
  }

  const handleDelete = (name: string) => {
    setDeleteTarget(name)
  }

  const confirmDelete = () => {
    if (deleteTarget) {
      removeDriver(deleteTarget)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('drivers.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('drivers.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setApplyDialogOpen(true)}
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
            className="h-8 text-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>{t('drivers.createDriver')}</span>
          </Button>
        </div>
      </div>

      {/* Config editing banner — shows when there are unsaved config changes */}
      {dirty && (
        <div className="rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning dark:text-status-warning flex items-center justify-between">
          <span>{t('drivers.unsavedChanges')}</span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => useConfigStore.getState().revert()}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              disabled={!!validationErrors}
              onClick={() => setApplyDialogOpen(true)}
            >
              {t('drivers.applyChanges')}
            </Button>
          </div>
        </div>
      )}

      {/* Live validation errors */}
      <ValidationBanner />

      {/* Config-managed drivers section (from working config) */}
      {configDrivers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('drivers.configSection')}
            </h2>
            <Badge variant="outline" className="text-[10px]">
              {configDrivers.length}
            </Badge>
            {configDrivers.length > 6 && (
              <EntitySearchBar value={searchQuery} onChange={setSearchQuery} />
            )}
          </div>
          {searchQuery && filteredConfigDrivers.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {t('common.noResults', { query: searchQuery }) || `No results for "${searchQuery}"`}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConfigDrivers.map((drv) => (
              <Card key={drv.name} className="border-border bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{drv.name}</CardTitle>
                        <CardDescription className="text-[11px] font-mono">
                          {drv.type}
                        </CardDescription>
                        {(() => {
                          const summary = getDriverConnectionSummary(workingConfig, drv.name)
                          if (!summary) return null
                          return (
                            <div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 truncate">
                              {summary}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(drv.name)}
                        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                        title={t('common.edit')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(drv.name)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
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
          <Badge variant="outline" className="text-[10px]">
            {drivers.length}
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.length === 0 ? (
            <Card className="col-span-full p-8 text-center text-xs text-muted-foreground border-dashed">
              {t('drivers.empty')}
            </Card>
          ) : (
            drivers.map((drv) => {
              const st = ConnStateLabel[drv.state] || ConnStateLabel[0]
              return (
                <Card
                  key={drv.name}
                  tabIndex={0}
                  role="button"
                  aria-label={`${drv.name} — ${st}`}
                  className="border-border bg-card hover:border-primary/40 transition-all cursor-pointer group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                          <CardDescription className="text-[11px] font-mono">
                            {drv.type}
                          </CardDescription>
                          {(() => {
                            const summary = getDriverConnectionSummary(parsedConfig, drv.name)
                            if (!summary) return null
                            return (
                              <div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 truncate">
                                {summary}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${st.dotColor}`} />
                        {t(st.key)}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pt-2 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-lg bg-muted/40 border border-border text-[11px]">
                      <div>
                        <div className="text-muted-foreground text-[10px]">{t('drivers.tags')}</div>
                        <div className="font-mono font-bold">{drv.tag_count}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          {t('drivers.reads')}
                        </div>
                        <div className="font-mono font-bold text-status-running">
                          {formatNumber(drv.read_count)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          {t('drivers.errors')}
                        </div>
                        <div className="font-mono font-bold text-status-error">
                          {drv.error_count}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] space-y-1 text-muted-foreground">
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
                      <div className="p-2 rounded bg-status-error/10 border border-status-error/20 text-status-error text-[11px] truncate flex items-center space-x-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{drv.last_error}</span>
                      </div>
                    )}

                    <div className="pt-1 flex items-center justify-between text-[11px]">
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('drivers.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('drivers.deleteConfirm', { name: deleteTarget ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply Config Confirmation */}
      <ConfigApplyConfirmationDialog
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
        beforeYaml={getSavedYaml()}
        afterYaml={getWorkingYaml() ?? ''}
        applying={updateConfig.isPending}
        validationErrors={validationErrors}
        onConfirm={() => {
          if (validationErrors) return
          const yaml = getWorkingYaml()
          if (!yaml) return
          updateConfig.mutate(
            { payload: yaml },
            {
              onSuccess: () => {
                markSaved()
                setApplyDialogOpen(false)
              },
            },
          )
        }}
      />
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
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/60 border-b border-border text-[10px] uppercase font-semibold text-muted-foreground">
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
                  {tags.map((tag) => {
                    const q = QualityLabel[tag.quality] || QualityLabel[0]
                    return (
                      <tr key={tag.tag} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-semibold">{tag.tag}</td>
                        <td className="px-3 py-2 text-muted-foreground">{tag.group || '-'}</td>
                        <td className="px-3 py-2 font-mono font-bold text-foreground">
                          {String(tag.value)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]">{tag.type}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-[9px] py-0 h-4 ${q.color}`}>
                            {t(q.key)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-[10px]">
                          {tag.timestamp ? new Date(tag.timestamp).toLocaleTimeString() : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
