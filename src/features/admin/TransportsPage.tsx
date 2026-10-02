import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfigRaw, useTransports } from '@/api/hooks'
import { ConnectionSummary } from '@/components/admin/DetailPageParts'
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
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { EntitySearchBar, filterEntities } from '@/components/wizard/EntitySearchBar'
import { UnsavedChangesBanner } from '@/components/wizard/UnsavedChangesBanner'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { TransportWizard } from '@/features/admin/TransportWizard'
import { useApplyConfig } from '@/hooks/useApplyConfig'
import { formatValidationErrors, useConfigValidation } from '@/hooks/useConfigValidation'
import { useEntityListPage } from '@/hooks/useEntityListPage'
import { useParsedConfig } from '@/hooks/useParsedConfig'
import { getTransportConnectionSummary } from '@/lib/connectionInfo'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber, isZeroTime } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import type { TransportConfig } from '@/types/config'

export const TransportsPage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const adminBase = id ? `/corec/${id}/admin` : '/admin'
  const { data, refetch, isFetching, isLoading, isError, error } = useTransports()
  const transports = data?.transports || []
  const { data: rawYaml } = useConfigRaw()
  // Live config from GET /configs/raw — used for runtime card connection summaries.
  // Wrapped in try/catch so a malformed YAML never crashes the whole list page.
  const parsedConfig = useParsedConfig(rawYaml)

  // Config editing state
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const dirty = useConfigStore((s) => s.dirty)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const removeTransport = useConfigStore((s) => s.removeTransport)
  const findTransport = useConfigStore((s) => s.findTransport)
  const getWorkingYaml = useConfigStore((s) => s.getWorkingYaml)
  const getSavedYaml = useConfigStore((s) => s.getSavedYaml)
  const markSaved = useConfigStore((s) => s.markSaved)
  const validation = useConfigValidation()
  const validationErrors = formatValidationErrors(validation)

  const [searchQuery, setSearchQuery] = useState('')

  const { openDialog: openApplyDialog, dialogProps: applyDialogProps } = useApplyConfig({
    getWorkingYaml,
    getSavedYaml,
    markSaved,
    validationErrors,
  })

  const {
    wizardOpen,
    setWizardOpen,
    editing: editingTransport,
    deleteTarget,
    setDeleteTarget,
    handleCreate,
    handleEdit,
    confirmDelete,
  } = useEntityListPage<TransportConfig>({
    find: findTransport,
    remove: removeTransport,
    resetToEmpty,
    hasWorkingConfig: !!workingConfig,
  })

  const configTransports = workingConfig?.transports ?? []
  const filteredConfigTransports = filterEntities(configTransports, searchQuery)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('transports.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('transports.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              variant="default"
              size="sm"
              onClick={() => openApplyDialog()}
              disabled={!!validationErrors}
              className="h-8 text-xs shrink-0"
            >
              {t('transports.applyChanges')}
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
            <span>{t('transports.createTransport')}</span>
          </Button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      <UnsavedChangesBanner
        dirty={dirty}
        unsavedChangesLabel={t('transports.unsavedChanges')}
        applyChangesLabel={t('transports.applyChanges')}
        hasValidationErrors={!!validationErrors}
        onApply={() => openApplyDialog()}
        onDiscard={() => useConfigStore.getState().revert()}
      />

      {/* Live validation errors */}
      <ValidationBanner />

      {/* Config-managed transports section */}
      {configTransports.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('transports.configSection')}
            </h2>
            <Badge variant="outline" className="text-xs">
              {configTransports.length}
            </Badge>
            {configTransports.length > 6 && (
              <EntitySearchBar value={searchQuery} onChange={setSearchQuery} />
            )}
          </div>
          {searchQuery && filteredConfigTransports.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {t('common.noResults', { query: searchQuery }) || `No results for "${searchQuery}"`}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 card-stagger">
            {filteredConfigTransports.map((tp) => (
              <Card key={tp.name} className="border-border bg-card card-enter">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Send className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{tp.name}</CardTitle>
                        <CardDescription className="text-xs font-mono">{tp.type}</CardDescription>
                        <ConnectionSummary
                          summary={getTransportConnectionSummary(workingConfig, tp.name)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(tp.name)}
                        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                        title={t('common.edit')}
                        aria-label={t('common.edit')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(tp.name)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
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
                    {tp['batch-size'] !== undefined && (
                      <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                        <span className="text-muted-foreground">{t('settings.batchSize')}</span>
                        <span className="font-mono font-bold">{tp['batch-size']}</span>
                      </div>
                    )}
                    {tp['flush-interval'] && (
                      <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                        <span className="text-muted-foreground">{t('settings.flushInterval')}</span>
                        <span className="font-mono font-bold">{tp['flush-interval']}</span>
                      </div>
                    )}
                    {tp.fallback && (
                      <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
                        <span className="text-muted-foreground">{t('settings.fallback')}</span>
                        <span className="font-mono truncate max-w-[100px]">{tp.fallback}</span>
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
            {t('transports.runtimeSection')}
          </h2>
          <Badge variant="outline" className="text-xs">
            {transports.length}
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 card-stagger">
          {isLoading && transports.length === 0 ? (
            <div className="col-span-full py-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading…</span>
            </div>
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
          ) : transports.length === 0 ? (
            <Card className="col-span-full p-8 text-center text-xs text-muted-foreground border-dashed">
              {t('transports.empty')}
            </Card>
          ) : (
            transports.map((tr) => {
              const st = ConnStateLabel[tr.state] || ConnStateLabel[0]
              const goDetail = () =>
                navigate(`${adminBase}/transports/${encodeURIComponent(tr.name)}`)
              return (
                <Card
                  key={tr.name}
                  tabIndex={0}
                  role="button"
                  aria-label={`${tr.name} — ${st}`}
                  className="border-border bg-card card-enter hover:border-primary/40 transition-all cursor-pointer group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={goDetail}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      goDetail()
                    }
                  }}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                          <Send className="w-4 h-4" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold">{tr.name}</CardTitle>
                          <CardDescription className="text-xs font-mono">{tr.type}</CardDescription>
                          <ConnectionSummary
                            summary={getTransportConnectionSummary(parsedConfig, tr.name)}
                          />
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
                        <div className="text-muted-foreground text-xs">
                          {t('transports.published')}
                        </div>
                        <div className="font-mono font-bold text-status-running">
                          {formatNumber(tr.published)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">
                          {t('transports.failed')}
                        </div>
                        <div className="font-mono font-bold text-status-error">{tr.failed}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">
                          {t('transports.queueSize')}
                        </div>
                        <div className="font-mono font-bold">{tr.queue_size}</div>
                      </div>
                    </div>

                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>{t('transports.commandsReceived')}</span>
                        <span className="font-mono font-medium text-foreground">
                          {formatNumber(tr.received)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('transports.droppedCommands')}</span>
                        <span className="font-mono font-medium text-status-error">
                          {tr.dropped_commands}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('transports.lastPublished')}</span>
                        <span className="font-mono text-foreground truncate max-w-[140px]">
                          {isZeroTime(tr.last_publish)
                            ? t('transports.never')
                            : new Date(tr.last_publish).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-end text-xs text-primary group-hover:underline">
                      <span>{t('transports.viewDetails')}</span>
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      {/* Create/Edit Transport Wizard */}
      <TransportWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        existingTransport={editingTransport}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transports.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transports.deleteConfirm', { name: deleteTarget ?? '' })}
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
      <ConfigApplyConfirmationDialog {...applyDialogProps} />
    </div>
  )
}
