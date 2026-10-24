import {
  AlertCircle,
  Archive,
  Camera,
  CheckCircle2,
  GitCompare,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useConfigBackupContent,
  useConfigBackups,
  useConfigRaw,
  useCreateConfigBackup,
  useRestoreConfigBackup,
} from '@/api/hooks'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { ScrollArea } from '@/components/ui/scroll-area'
import { computeLcsDiff } from '@/lib/yamlDiff'
import type { ConfigBackupInfo } from '@/types/api'

/** Human-readable byte size — backups are whole config files, so B/KB/MB covers it. */
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Status message shown above the list after a restore attempt. */
type RestoreMsg = { type: 'success'; text: string } | { type: 'error'; text: string }

/**
 * ServerBackupsPanel — the server-side config backup timeline.
 *
 * CoreC snapshots the persisted config file before every reload (newest 10
 * kept, hub/executor/backups.go). This panel lists them and lets the
 * operator:
 *  - view the line diff of a backup against the CURRENT raw config
 *    (computeLcsDiff, same renderer as the Config Center diff preview);
 *  - restore one through a TWO-STEP confirmation — restoring overwrites
 *    the active configuration, so a details dialog is followed by a
 *    final AlertDialog gate (the same double-confirm posture as the
 *    dead-letter clear-all).
 *
 * The restore endpoint replays the backup through the full PUT /configs
 * reload chain server-side; a validation failure (400) leaves the running
 * config untouched and is shown verbatim.
 */
export const ConfigBackupsPanel: React.FC = () => {
  const { t } = useTranslation()
  const backupsQuery = useConfigBackups()
  const rawConfigQuery = useConfigRaw()
  const restoreMutation = useRestoreConfigBackup()
  const snapshotMutation = useCreateConfigBackup()

  // Diff dialog: the backup being compared (content fetched lazily while open).
  const [diffTarget, setDiffTarget] = useState<ConfigBackupInfo | null>(null)
  const contentQuery = useConfigBackupContent(diffTarget?.name)
  // Two-step restore: stage 1 = details dialog, stage 2 = final AlertDialog.
  const [restoreTarget, setRestoreTarget] = useState<ConfigBackupInfo | null>(null)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<RestoreMsg | null>(null)

  const backups = backupsQuery.data?.backups ?? []

  // Diff of current raw config → backup content. "removed" lines leave the
  // active config, "added" lines come in from the backup — i.e. exactly what
  // a restore would change. Only computed once both texts are loaded.
  const { diffLines, hasDiffChanges } = useMemo(() => {
    if (!rawConfigQuery.data || !contentQuery.data) return { diffLines: [], hasDiffChanges: false }
    const lines = computeLcsDiff(rawConfigQuery.data, contentQuery.data)
    return { diffLines: lines, hasDiffChanges: lines.some((l) => l.type !== 'equal') }
  }, [rawConfigQuery.data, contentQuery.data])

  const startRestore = (backup: ConfigBackupInfo) => {
    setRestoreMsg(null)
    setRestoreTarget(backup)
  }

  // Manual snapshot: an explicit operator checkpoint of the current
  // on-disk config (the automatic pre-overwrite snapshots are separate).
  // Rejected results (404 no file yet / 503 no config path) surface the
  // server message verbatim in the same feedback strip as restores.
  const takeSnapshot = async () => {
    setRestoreMsg(null)
    const result = await snapshotMutation.mutateAsync()
    if (result.outcome === 'created') {
      setRestoreMsg({
        type: 'success',
        text: t('config.backupsSnapshotCreated', { name: result.name }),
      })
    } else {
      setRestoreMsg({
        type: 'error',
        text: `${t('config.backupsSnapshotFailed')} (${result.status}): ${result.error}`,
      })
    }
  }

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return
    const name = restoreTarget.name
    setRestoreConfirmOpen(false)
    try {
      const result = await restoreMutation.mutateAsync(name)
      if (result.outcome === 'restored') {
        setRestoreTarget(null)
        setRestoreMsg({ type: 'success', text: t('config.backupsRestoreSuccess') })
      } else {
        // Rejected by the server (400 validation / 404 unknown / 503 no
        // config path) — the message is the answer, nothing was applied.
        setRestoreMsg({
          type: 'error',
          text: t('config.backupsRestoreRejected', {
            status: result.status,
            error: result.error,
          }),
        })
      }
    } catch (err: unknown) {
      // Genuine transport failure (401/timeout/5xx) — surface ApiError body.
      setRestoreMsg({
        type: 'error',
        text: t('config.backupsRestoreFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      })
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <Archive className="w-4 h-4 text-primary" />
            <span>{t('config.backupsTitle')}</span>
          </CardTitle>
          <CardDescription className="text-xs">{t('config.backupsDesc')}</CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={takeSnapshot}
            disabled={snapshotMutation.isPending}
            className="h-8 text-xs"
            data-testid="backup-snapshot-now"
          >
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            <span>{t('config.backupsSnapshotNow')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => backupsQuery.refetch()}
            disabled={backupsQuery.isFetching}
            className="h-8 text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${backupsQuery.isFetching ? 'animate-spin' : ''}`}
            />
            <span>{t('common.refresh')}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0">
        {restoreMsg && (
          <div
            className={`mb-3 p-2 rounded-lg text-xs flex items-center space-x-2 ${
              restoreMsg.type === 'success'
                ? 'bg-status-running/10 border border-status-running/20 text-status-running'
                : 'bg-status-error/10 border border-status-error/20 text-status-error'
            }`}
          >
            {restoreMsg.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="break-all">{restoreMsg.text}</span>
          </div>
        )}

        {backupsQuery.isLoading ? (
          <LoadingState className="py-6" />
        ) : backupsQuery.isError ? (
          <div className="space-y-3 py-6 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-status-error" />
            <div className="text-sm font-semibold">{t('common.error')}</div>
            {backupsQuery.error instanceof Error && backupsQuery.error.message && (
              <div className="mx-auto max-w-md break-all font-mono text-xs text-status-error/80">
                {backupsQuery.error.message}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => backupsQuery.refetch()}
              disabled={backupsQuery.isFetching}
              className="h-8 text-xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${backupsQuery.isFetching ? 'animate-spin' : ''}`}
              />
              {t('common.retry')}
            </Button>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
            <Archive className="w-5 h-5 text-muted-foreground/60 mb-1" />
            <span>{t('config.backupsEmpty')}</span>
          </div>
        ) : (
          <ScrollArea className="h-56">
            <div className="space-y-2 pr-3">
              {backups.map((backup) => (
                <div
                  key={backup.name}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-foreground">
                      {new Date(backup.timestamp).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground truncate font-mono">
                      {backup.name} · {formatSize(backup.size)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRestoreMsg(null)
                        setDiffTarget(backup)
                      }}
                      disabled={!rawConfigQuery.data}
                      className="h-7 text-xs"
                    >
                      <GitCompare className="w-3 h-3 mr-1" />
                      {t('config.backupsDiff')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startRestore(backup)}
                      disabled={restoreMutation.isPending}
                      className="h-7 text-xs"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {t('config.backupsRestore')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Backup diff dialog — current raw config vs the backup's YAML text. */}
      <Dialog open={diffTarget !== null} onOpenChange={(open) => !open && setDiffTarget(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <GitCompare className="w-4 h-4 text-primary" />
              {t('config.backupsDiffTitle')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {diffTarget
                ? `${new Date(diffTarget.timestamp).toLocaleString()} — ${t('config.backupsDiffDesc')}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center space-x-4 px-3 py-1.5 bg-muted/40 border-b border-border text-xs">
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-status-running/40" />
                <span className="text-muted-foreground">{t('config.diffAdded')}</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-status-error/40" />
                <span className="text-muted-foreground">{t('config.diffRemoved')}</span>
              </span>
            </div>
            {contentQuery.isLoading || !rawConfigQuery.data ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                {t('config.backupsDiffLoading')}
              </div>
            ) : contentQuery.isError ? (
              <div className="p-3 text-xs text-status-error break-all">
                {contentQuery.error instanceof Error
                  ? t('config.backupsDiffFailed', { error: contentQuery.error.message })
                  : t('config.backupsDiffFailed', { error: String(contentQuery.error) })}
              </div>
            ) : hasDiffChanges ? (
              <ScrollArea className="h-[50vh] min-h-[240px]">
                <div className="font-mono text-xs">
                  {diffLines.map((line, idx) => (
                    <div
                      key={`backup-diff-${idx}`}
                      className={`px-3 py-0.5 whitespace-pre-wrap break-all ${
                        line.type === 'added'
                          ? 'bg-status-running/10 text-status-running diff-line-add'
                          : line.type === 'removed'
                            ? 'bg-status-error/10 text-status-error diff-line-remove'
                            : 'text-muted-foreground'
                      }`}
                    >
                      <span className="inline-block w-4 select-none">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      {line.text === '' ? '\u00A0' : line.text}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('config.diffNoChanges')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore step 1/2 — what happens, which backup, and the rollback note. */}
      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-primary" />
              <span>{t('config.backupsRestoreTitle')}</span>
            </DialogTitle>
            <DialogDescription>{t('config.backupsRestoreDesc')}</DialogDescription>
          </DialogHeader>

          {restoreTarget && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
                <span className="text-muted-foreground">{t('common.timestamp')}</span>
                <span className="text-foreground break-all">
                  {new Date(restoreTarget.timestamp).toLocaleString()}
                </span>
                <span className="text-muted-foreground">{t('common.name')}</span>
                <span className="text-foreground break-all">{restoreTarget.name}</span>
                <span className="text-muted-foreground">size</span>
                <span className="text-foreground">{formatSize(restoreTarget.size)}</span>
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
            {t('config.backupsRestoreWarning')}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => setRestoreConfirmOpen(true)}>
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
              {t('config.backupsRestoreContinue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore step 2/2 — final gate before the active config is overwritten. */}
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-status-error" />
              <span>{t('config.backupsRestoreConfirmTitle')}</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('config.backupsRestoreConfirmDesc', {
                name: restoreTarget?.name ?? '',
                time: restoreTarget ? new Date(restoreTarget.timestamp).toLocaleString() : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                // Keep the dialog open until the mutation resolves —
                // AlertDialogAction closes by default; prevent it so the
                // result message lands in the panel instead of a silent close.
                e.preventDefault()
                void handleRestoreConfirm()
              }}
              disabled={restoreMutation.isPending}
              // The danger confirm joins the destructive variant —
              // status-error red is reserved for status indication.
              className="danger-pulse"
            >
              {restoreMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t('config.reloading')}
                </>
              ) : (
                t('config.backupsRestoreConfirm')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
