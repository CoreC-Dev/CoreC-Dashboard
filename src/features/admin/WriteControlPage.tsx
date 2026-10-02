import {
  AlertCircle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Terminal,
  Trash2,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/client'
import { useDeadLetters, useDrivers, useWriteTag } from '@/api/hooks'
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DataTypeString } from '@/lib/constants'
import { validateValue } from '@/lib/writeValidation'
import { DATA_TYPES } from '@/types/config'
import type { DeadLetterEntry, WriteCommand } from '@/types/models'

// Extracts a human-readable error message from CoreC's JSON error response
// body (e.g. {"error":"unsupported patch key(s): [foo]"}). Falls back to the
// raw body if it's not JSON or has no "error" field; the caller supplies the
// final fallback string (translated) for an empty body.
function extractApiError(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body)
    if (parsed?.error) return parsed.error
    if (typeof parsed === 'string') return parsed
  } catch {
    // body is not JSON
  }
  return body.slice(0, 200) || fallback
}

/** Stable key for a dead-letter entry (driver + tag + failed_at). */
const dlqKeyOf = (dl: DeadLetterEntry): string =>
  `${dl.command.driver}-${dl.command.tag}-${dl.failed_at}`

/** sessionStorage key for the set of dead-letter keys the operator has
 *  cleared. CoreC exposes no DELETE endpoint for dead letters, so "Clear All"
 *  is a client-side hide. Without persistence the cleared set was lost on
 *  unmount/refresh, so cleared entries reappeared. [L-5] */
const DLQ_CLEARED_KEY = 'corec_dlq_cleared'

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
  const [clearedDlqKeys, setClearedDlqKeys] = useState<Set<string>>(() => {
    // Restore cleared keys from sessionStorage so cleared entries stay hidden
    // across remounts and page refreshes. [L-5]
    try {
      const stored = sessionStorage.getItem(DLQ_CLEARED_KEY)
      if (stored) return new Set(JSON.parse(stored) as string[])
    } catch {
      // Ignore parse errors — start with an empty set.
    }
    return new Set()
  })
  const [dlqClearedMsg, setDlqClearedMsg] = useState<string | null>(null)

  // Persist cleared keys to sessionStorage whenever they change. [L-5]
  useEffect(() => {
    try {
      sessionStorage.setItem(DLQ_CLEARED_KEY, JSON.stringify([...clearedDlqKeys]))
    } catch {
      // sessionStorage may be unavailable (private mode) — silently ignore.
    }
  }, [clearedDlqKeys])

  const drivers = driversData?.drivers || []
  const deadLetters = deadLettersData?.failed_writes || []

  // CoreC exposes no DELETE endpoint for dead letters, so "Clear All" is a
  // client-side hide: cleared entry keys are tracked locally and filtered out
  // of the rendered list. Newly arriving failures (new failed_at timestamps)
  // still surface, while refetched-but-already-cleared entries stay hidden.
  const visibleDeadLetters = deadLetters.filter((dl) => !clearedDlqKeys.has(dlqKeyOf(dl)))

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
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-primary" />
              <span>{t('write.dispatch')}</span>
            </CardTitle>
            <CardDescription className="text-xs">{t('write.dispatchDesc')}</CardDescription>
          </CardHeader>

          <form onSubmit={handleWriteSubmit}>
            <CardContent className="p-4 space-y-4">
              {successMsg && (
                <div className="p-3 rounded-lg bg-status-running/10 border border-status-running/20 text-status-running text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {t('write.targetDriver')} *
                  </label>
                  <Select value={driver} onValueChange={setDriver}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('write.selectDriver')} />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.map((d) => (
                        <SelectItem key={d.name} value={d.name}>
                          {d.name} ({d.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {t('write.deviceOptional')}
                  </label>
                  <Input
                    placeholder={t('write.devicePlaceholder')}
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {t('write.tagName')} *
                  </label>
                  <Input
                    placeholder={t('write.tagPlaceholder')}
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    required
                    className="h-9 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {t('write.dataType')} *
                  </label>
                  <Select value={type} onValueChange={(v) => setType(v as DataTypeString)}>
                    <SelectTrigger className="font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATA_TYPES.map((dt) => (
                        <SelectItem key={dt} value={dt} className="font-mono">
                          {dt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {t('write.targetValue')} *
                </label>
                <Input
                  placeholder={
                    type === 'bool' ? t('write.boolPlaceholder') : t('write.valuePlaceholder')
                  }
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  className="h-9 font-mono text-xs"
                />
              </div>

              <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
                {t('write.confirmWarning')}
              </div>
            </CardContent>

            <CardFooter className="p-4 pt-0">
              <Button
                type="submit"
                disabled={confirmOpen}
                className="w-full sm:w-auto h-9 font-semibold flex items-center space-x-2 glow-primary"
              >
                <span>{t('write.submit')}</span>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </CardFooter>
          </form>
        </Card>

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
      <Card className="border-border bg-card">
        <CardHeader className="p-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-status-error">
              <AlertOctagon className="w-4 h-4" />
              <span>{t('write.deadLetterTitle')}</span>
            </CardTitle>
            <CardDescription className="text-xs">{t('write.deadLetterDesc')}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearConfirmOpen(true)}
              disabled={visibleDeadLetters.length === 0 || fetchingDlq}
              className="h-8 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              <span>{t('write.clearAll')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDlqClearedMsg(null)
                refetchDeadLetters()
              }}
              disabled={fetchingDlq}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${fetchingDlq ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          {dlqClearedMsg && (
            <div className="mb-3 p-3 rounded-lg bg-status-running/10 border border-status-running/20 text-status-running text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{dlqClearedMsg}</span>
            </div>
          )}
          {replayError && (
            <div className="mb-3 p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{t('write.replayFailed', { error: replayError })}</span>
            </div>
          )}

          {loadingDlq ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : errorDlq ? (
            <div className="space-y-3 py-8 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-status-error" />
              <div className="text-sm font-semibold">{t('common.error')}</div>
              {dlqError instanceof Error && dlqError.message && (
                <div className="mx-auto max-w-md break-all font-mono text-xs text-status-error/80">
                  {dlqError.message}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchDeadLetters()}
                disabled={fetchingDlq}
                className="h-8 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${fetchingDlq ? 'animate-spin' : ''}`} />
                {t('common.retry')}
              </Button>
            </div>
          ) : visibleDeadLetters.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
              <CheckCircle2 className="w-6 h-6 text-status-running mb-1" />
              <span>{t('write.noDeadLetters')}</span>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleDeadLetters.map((dl) => (
                <div
                  key={`${dl.command.driver}-${dl.command.tag}-${dl.failed_at}-${dl.attempts}`}
                  className="p-3 rounded-lg border border-status-error/20 bg-status-error/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 font-mono">
                    <div className="text-status-error font-semibold">
                      [{dl.command.driver}] {t('common.tag')}: {dl.command.tag} ={' '}
                      {String(dl.command.value)} ({dl.command.type})
                    </div>
                    <div className="text-xs text-muted-foreground">{dl.error}</div>
                    <div className="text-xs text-muted-foreground flex items-center space-x-2">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(dl.failed_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>{t('write.attemptsExhausted', { count: dl.attempts })}</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReplay(dl.command)}
                    disabled={writeMutation.isPending}
                    className="shrink-0 text-xs border-status-error/30 text-status-error hover:bg-status-error/10"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    <span>{t('write.retry')}</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
