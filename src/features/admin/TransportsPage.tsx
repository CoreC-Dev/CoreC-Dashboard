import { ExternalLink, Pencil, Plus, RefreshCw, Send, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfigRaw, useTransports, useUpdateConfig } from '@/api/hooks'
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
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { TransportWizard } from '@/features/admin/TransportWizard'
import { useConfigValidation } from '@/hooks/useConfigValidation'
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
  const { data, refetch, isFetching } = useTransports()
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
  const validationErrors =
    validation.hasConfig && !validation.valid
      ? validation.errors.map((e) => `${e.path}: ${e.message}`)
      : undefined

  const updateConfig = useUpdateConfig()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingTransport, setEditingTransport] = useState<TransportConfig | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const configTransports = workingConfig?.transports ?? []
  const filteredConfigTransports = filterEntities(configTransports, searchQuery)

  const handleCreate = () => {
    if (!workingConfig) resetToEmpty()
    setEditingTransport(undefined)
    setWizardOpen(true)
  }

  const handleEdit = (name: string) => {
    const tp = findTransport(name)
    if (!tp) return
    setEditingTransport(tp)
    setWizardOpen(true)
  }

  const confirmDelete = () => {
    if (deleteTarget) {
      removeTransport(deleteTarget)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('transports.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('transports.subtitle')}</p>
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
      {dirty && (
        <div className="rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning dark:text-status-warning flex items-center justify-between">
          <span>{t('transports.unsavedChanges')}</span>
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
              {t('transports.applyChanges')}
            </Button>
          </div>
        </div>
      )}

      {/* Live validation errors */}
      <ValidationBanner />

      {/* Config-managed transports section */}
      {configTransports.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('transports.configSection')}
            </h2>
            <Badge variant="outline" className="text-[10px]">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConfigTransports.map((tp) => (
              <Card key={tp.name} className="border-border bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Send className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{tp.name}</CardTitle>
                        <CardDescription className="text-[11px] font-mono">
                          {tp.type}
                        </CardDescription>
                        {(() => {
                          const summary = getTransportConnectionSummary(workingConfig, tp.name)
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
                        onClick={() => handleEdit(tp.name)}
                        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                        title={t('common.edit')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(tp.name)}
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
          <Badge variant="outline" className="text-[10px]">
            {transports.length}
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {transports.length === 0 ? (
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
                  className="border-border bg-card hover:border-primary/40 transition-all cursor-pointer group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                          <CardDescription className="text-[11px] font-mono">
                            {tr.type}
                          </CardDescription>
                          {(() => {
                            const summary = getTransportConnectionSummary(parsedConfig, tr.name)
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
                        <div className="text-muted-foreground text-[10px]">
                          {t('transports.published')}
                        </div>
                        <div className="font-mono font-bold text-status-running">
                          {formatNumber(tr.published)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          {t('transports.failed')}
                        </div>
                        <div className="font-mono font-bold text-status-error">{tr.failed}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          {t('transports.queueSize')}
                        </div>
                        <div className="font-mono font-bold">{tr.queue_size}</div>
                      </div>
                    </div>

                    <div className="text-[11px] space-y-1 text-muted-foreground">
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

                    <div className="pt-1 flex items-center justify-end text-[11px] text-primary group-hover:underline">
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
