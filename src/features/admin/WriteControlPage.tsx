import { AlertOctagon, Loader2, Send, ShieldAlert } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { extractApiError } from '@/api/client'
import { ApiError, useDeadLetters, useDrivers, useWriteTag } from '@/api/hooks'
import { DeadLetterTable, WriteForm } from '@/components/admin/WriteControlParts'
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
import { useClearedDlqKeys } from '@/hooks/useClearedDlqKeys'
import type { DataTypeString } from '@/lib/constants'
import { validateValue } from '@/lib/writeValidation'
import type { DeadLetterEntry, WriteCommand } from '@/types/models'

/** Stable key for a dead-letter entry (driver + tag + failed_at). */
const dlqKeyOf = (dl: DeadLetterEntry): string =>
  `${dl.command.driver}-${dl.command.tag}-${dl.failed_at}`

export const WriteControlPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: driversData } = useDrivers()
  const {
    data: deadLettersData,
    refetch: refetchDeadLetters,
    isFetching: fetchingDlq,
    isLoading: loadingDlq,
    isError: errorDlq,
    error: dlqError,
  } = useDeadLetters()
  const writeMutation = useWriteTag()

  const [driver, setDriver] = useState('')
  const [device, setDevice] = useState('')
  const [tag, setTag] = useState('')
  const [type, setType] = useState<DataTypeString>('float32')
  const [value, setValue] = useState('')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [replayError, setReplayError] = useState<string | null>(null)
  const [pendingCmd, setPendingCmd] = useState<WriteCommand | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const { clearedDlqKeys, setClearedDlqKeys } = useClearedDlqKeys()
  const [dlqClearedMsg, setDlqClearedMsg] = useState<string | null>(null)

  const drivers = driversData?.drivers || []
  const deadLetters = deadLettersData?.failed_writes || []

  // CoreC exposes no DELETE endpoint for dead letters, so "Clear All" is a
  // client-side hide: cleared entry keys are tracked locally and filtered out
  // of the rendered list. Newly arriving failures (new failed_at timestamps)
  // still surface, while refetched-but-already-cleared entries stay hidden.
  const visibleDeadLetters = useMemo(
    () => deadLetters.filter((dl) => !clearedDlqKeys.has(dlqKeyOf(dl))),
    [deadLetters, clearedDlqKeys],
  )

  const parseValue = (raw: string, dt: DataTypeString): string | number | boolean => {
    if (dt === 'bool') {
      return raw.toLowerCase() === 'true' || raw === '1'
    }
    if (dt.startsWith('int') || dt.startsWith('uint') || dt.startsWith('float')) {
      return Number(raw)
    }
    return raw
  }

  // Industrial safety: the form only stages the command and opens a
  // confirmation dialog. The actual write fires from handleConfirmWrite after
  // an explicit second "Confirm Write" click.
  const handleWriteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMsg(null)
    setErrorMsg(null)
    setReplayError(null)

    if (!driver || !tag) {
      setErrorMsg(t('write.selectDriverAndTag'))
      return
    }

    const validationError = validateValue(value, type, t)
    if (validationError) {
      setErrorMsg(validationError)
      return
    }

    setPendingCmd({
      driver,
      device: device || undefined,
      tag,
      type,
      value: parseValue(value, type),
    })
    setConfirmOpen(true)
  }

  const handleConfirmWrite = async () => {
    if (!pendingCmd) return
    try {
      await writeMutation.mutateAsync(pendingCmd)
      setSuccessMsg(
        t('write.writeSuccess', { driver: pendingCmd.driver, tag: pendingCmd.tag, value }),
      )
      setValue('')
      setConfirmOpen(false)
      setPendingCmd(null)
    } catch (err) {
      // Surface CoreC's error body (e.g. "unsupported patch key(s)") when
      // available — ApiError carries the response body in .body.
      const msg =
        err instanceof ApiError && err.body
          ? extractApiError(err.body, t('write.unknownError'))
          : err instanceof Error
            ? err.message
            : t('write.writeFailed')
      setErrorMsg(msg)
      setConfirmOpen(false)
    }
  }

  const handleReplay = async (cmd: WriteCommand) => {
    setReplayError(null)
    try {
      await writeMutation.mutateAsync(cmd)
      // No manual refetch needed — useWriteTag's onSuccess invalidates
      // ['deadLetters'], triggering an automatic refetch.
    } catch (err) {
      const msg =
        err instanceof ApiError && err.body
          ? extractApiError(err.body, t('write.unknownError'))
          : err instanceof Error
            ? err.message
            : t('write.unknownError')
      setReplayError(msg)
    }
  }

  // Industrial safety: clearing is a second-confirmed action. The AlertDialog
  // gates the actual state mutation behind an explicit "Confirm" click.
  const handleClearDeadLetters = () => {
    setClearedDlqKeys((prev) => {
      const next = new Set(prev)
      for (const dl of deadLetters) next.add(dlqKeyOf(dl))
      return next
    })
    setDlqClearedMsg(t('write.deadLettersCleared'))
    setClearConfirmOpen(false)
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('write.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('write.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Command Form */}
        <WriteForm
          drivers={drivers}
          driver={driver}
          setDriver={setDriver}
          device={device}
          setDevice={setDevice}
          tag={tag}
          setTag={setTag}
          type={type}
          setType={setType}
          value={value}
          setValue={setValue}
          successMsg={successMsg}
          errorMsg={errorMsg}
          onSubmit={handleWriteSubmit}
          confirmOpen={confirmOpen}
        />

        {/* Right: Info Card */}
        <Card className="border-border bg-card">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold">{t('write.concurrencyRetries')}</CardTitle>
            <CardDescription className="text-xs">
              {t('write.concurrencyRetriesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3 text-xs text-muted-foreground">
            <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
              <div className="font-semibold text-foreground">{t('write.commandConcurrency')}</div>
              <p>{t('write.commandConcurrencyDesc')}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
              <div className="font-semibold text-foreground">{t('write.writeRetryCount')}</div>
              <p>{t('write.writeRetryCountDesc')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-step write confirmation (INDUSTRIAL SAFETY) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-status-warning" />
              <span>{t('write.confirmWriteTitle')}</span>
            </DialogTitle>
            <DialogDescription>{t('write.confirmWriteDesc')}</DialogDescription>
          </DialogHeader>

          {pendingCmd && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs font-mono">
                <span className="text-muted-foreground">{t('common.driver')}</span>
                <span className="text-foreground break-all">{pendingCmd.driver}</span>
                <span className="text-muted-foreground">{t('common.device')}</span>
                <span className="text-foreground break-all">
                  {pendingCmd.device || t('write.none')}
                </span>
                <span className="text-muted-foreground">{t('common.tag')}</span>
                <span className="text-foreground break-all">{pendingCmd.tag}</span>
                <span className="text-muted-foreground">{t('common.type')}</span>
                <span className="text-foreground">{String(pendingCmd.type)}</span>
                <span className="text-muted-foreground">{t('common.value')}</span>
                <span className="text-foreground break-all">{String(pendingCmd.value)}</span>
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
            {t('write.confirmWarning')}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={writeMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmWrite}
              disabled={writeMutation.isPending || !pendingCmd}
            >
              {writeMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t('write.writing')}
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {t('write.confirmWrite')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dead Letter Queue Section */}
      <DeadLetterTable
        visibleDeadLetters={visibleDeadLetters}
        loadingDlq={loadingDlq}
        errorDlq={errorDlq}
        fetchingDlq={fetchingDlq}
        dlqError={dlqError}
        dlqClearedMsg={dlqClearedMsg}
        replayError={replayError}
        onRefresh={() => {
          setDlqClearedMsg(null)
          refetchDeadLetters()
        }}
        onClearAll={() => setClearConfirmOpen(true)}
        onReplay={handleReplay}
        isWritePending={writeMutation.isPending}
      />

      {/* Dead letter batch clear confirmation (INDUSTRIAL SAFETY — double confirm) */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-status-error" />
              <span>{t('write.clearAllConfirm')}</span>
            </AlertDialogTitle>
            <AlertDialogDescription>{t('write.clearAllDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('write.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearDeadLetters}
              className="bg-status-error text-white shadow hover:bg-status-error/90"
            >
              {t('write.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
