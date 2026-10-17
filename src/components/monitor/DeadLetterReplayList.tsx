import {
  AlertCircle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { extractApiError } from '@/api/client'
import { ApiError, useWriteTag } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { DeadLetterEntry, WriteCommand } from '@/types/models'

/** Cap rendered dead letters to prevent DOM overload (TD-PERF-005). */
const MAX_VISIBLE_DLQ = 100

/** Stable key for a dead-letter entry (driver + tag + failed_at + attempts). */
const dlqKeyOf = (dl: DeadLetterEntry): string =>
  `${dl.command.driver}-${dl.command.tag}-${dl.failed_at}-${dl.attempts}`

/** Short human label of a dead letter's command, used in dialogs and results. */
const labelOf = (dl: DeadLetterEntry): string =>
  `[${dl.command.driver}] ${dl.command.tag} = ${String(dl.command.value)}`

/**
 * Re-issues a dead letter via the existing POST /write. Builds a CLEAN
 * command (driver/device/tag/value/type only): the recorded command carries
 * the server-stamped source/remote audit fields, which POST /write re-stamps
 * at its own trust boundary anyway.
 */
const cleanCommandOf = (dl: DeadLetterEntry): WriteCommand => ({
  driver: dl.command.driver,
  device: dl.command.device,
  tag: dl.command.tag,
  value: dl.command.value,
  type: dl.command.type,
})

/** Per-item outcome of a batch replay. */
interface ReplayOutcome {
  key: string
  label: string
  ok: boolean
  error?: string
}

interface DeadLetterReplayListProps {
  deadLetters: DeadLetterEntry[]
  isLoading: boolean
  isError: boolean
  error: unknown
  isFetching: boolean
  onRefresh: () => void
}

/**
 * The Alerts page's dead-letter card: the failed-write queue with per-entry
 * retry and BATCH replay.
 *
 * Batch replay is a PLC write — a dangerous operation — so it follows the
 * repo's write-control confirmation pattern: selecting entries only stages
 * them; one confirmation dialog per batch lists every command that will be
 * re-sent, and only its destructive confirm fires the writes. Commands are
 * re-dispatched one by one through the existing POST /write mutation, and
 * each item's outcome (success / verbatim failure) is rendered afterwards.
 */
export const DeadLetterReplayList: React.FC<DeadLetterReplayListProps> = ({
  deadLetters,
  isLoading,
  isError,
  error,
  isFetching,
  onRefresh,
}) => {
  const { t } = useTranslation()
  const writeMutation = useWriteTag()

  // Single-entry retry state (per-row button).
  const [retryError, setRetryError] = useState<string | null>(null)
  const [pendingRetryKey, setPendingRetryKey] = useState<string | null>(null)

  // Batch replay state: selection → per-batch confirm dialog → results.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ReplayOutcome[]>([])

  const visibleDeadLetters = useMemo(() => deadLetters.slice(0, MAX_VISIBLE_DLQ), [deadLetters])
  const selectedEntries = useMemo(
    () => visibleDeadLetters.filter((dl) => selected.has(dlqKeyOf(dl))),
    [visibleDeadLetters, selected],
  )

  const toggleSelected = (key: string) => {
    setResults([])
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllVisible = () => {
    setResults([])
    setSelected((prev) => {
      if (visibleDeadLetters.every((dl) => prev.has(dlqKeyOf(dl)))) return new Set()
      return new Set(visibleDeadLetters.map((dl) => dlqKeyOf(dl)))
    })
  }

  const writeErrorMsg = (err: unknown): string => {
    if (err instanceof ApiError && err.body) {
      return extractApiError(err.body, t('write.unknownError'))
    }
    return err instanceof Error ? err.message : t('write.unknownError')
  }

  const handleRetryDeadLetter = async (dl: DeadLetterEntry, retryKey: string) => {
    setRetryError(null)
    setPendingRetryKey(retryKey)
    try {
      await writeMutation.mutateAsync(cleanCommandOf(dl))
      // No manual refetch — useWriteTag invalidates ['deadLetters'].
    } catch (err: unknown) {
      setRetryError(writeErrorMsg(err))
    } finally {
      setPendingRetryKey(null)
    }
  }

  // Confirmed batch: re-send every selected command ONE BY ONE and record
  // each outcome so the operator sees exactly which entries replayed.
  const handleConfirmBatch = async () => {
    if (selectedEntries.length === 0 || running) return
    setRunning(true)
    const outcomes: ReplayOutcome[] = []
    for (const dl of selectedEntries) {
      const key = dlqKeyOf(dl)
      try {
        await writeMutation.mutateAsync(cleanCommandOf(dl))
        outcomes.push({ key, label: labelOf(dl), ok: true })
      } catch (err: unknown) {
        outcomes.push({ key, label: labelOf(dl), ok: false, error: writeErrorMsg(err) })
      }
    }
    setResults(outcomes)
    setRunning(false)
    setConfirmOpen(false)
    setSelected(new Set())
  }

  const allVisibleSelected =
    visibleDeadLetters.length > 0 && visibleDeadLetters.every((dl) => selected.has(dlqKeyOf(dl)))

  return (
    <Card className="border-border bg-card card-enter">
      <CardHeader className="p-4 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-status-error">
            <AlertOctagon className="w-4 h-4" />
            <span>{t('alerts.deadLetterControlQueue')}</span>
          </CardTitle>
          <CardDescription className="text-xs">{t('alerts.deadLetterDesc')}</CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={selectedEntries.length === 0 || running}
            className="h-8 text-xs border-status-error/30 text-status-error hover:bg-status-error/10"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            )}
            <span>{t('alerts.replaySelected', { count: selectedEntries.length })}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {retryError && (
          <div className="mb-3 p-2 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-center space-x-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{t('write.replayFailed', { error: retryError })}</span>
          </div>
        )}

        {results.length > 0 && (
          <div className="mb-3 p-3 rounded-lg bg-muted/40 border border-border space-y-1.5">
            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t('alerts.replayResults')}</span>
              <span className="text-muted-foreground font-mono font-normal">
                {t('alerts.replayBatchDone', {
                  ok: results.filter((r) => r.ok).length,
                  failed: results.filter((r) => !r.ok).length,
                })}
              </span>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {results.map((r) => (
                <div key={`result-${r.key}`} className="flex items-center gap-2 text-xs font-mono">
                  {r.ok ? (
                    <Badge variant="success" className="text-[10px] px-2 py-0 shrink-0">
                      {t('writeHistory.success')}
                    </Badge>
                  ) : (
                    <Badge variant="error" className="text-[10px] px-2 py-0 shrink-0">
                      {t('writeHistory.failed')}
                    </Badge>
                  )}
                  <span
                    className={`truncate ${r.ok ? 'text-foreground' : 'text-status-error'}`}
                    title={r.label}
                  >
                    {r.label}
                    {r.error && <span className="text-muted-foreground"> — {r.error}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading && deadLetters.length === 0 ? (
          <LoadingState className="py-8" />
        ) : isError ? (
          <div className="space-y-3 py-8 text-center">
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
              onClick={onRefresh}
              disabled={isFetching}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              {t('common.retry')}
            </Button>
          </div>
        ) : deadLetters.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-status-running mb-1" />
            <span>{t('alerts.noDeadLetters')}</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-1 border-b border-border/60">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={toggleAllVisible}
                aria-label={t('alerts.selectAllDeadLetters')}
                disabled={running}
              />
              <span className="text-xs text-muted-foreground">
                {t('alerts.selectAllDeadLetters')}
              </span>
            </div>
            {visibleDeadLetters.map((entry) => {
              const retryKey = dlqKeyOf(entry)
              const isSelected = selected.has(retryKey)
              return (
                <div
                  key={retryKey}
                  className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm transition-colors ${
                    isSelected
                      ? 'border-status-error/40 bg-status-error/10'
                      : 'border-status-error/20 bg-status-error/5 hover:bg-status-error/10'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(retryKey)}
                      aria-label={t('alerts.selectDeadLetter', { tag: entry.command.tag })}
                      disabled={running || pendingRetryKey === retryKey}
                      className="mt-0.5"
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="font-mono font-semibold text-status-error text-sm break-all">
                        [{entry.command.driver}] {t('common.tag')}: {entry.command.tag} ={' '}
                        {String(entry.command.value)}
                      </div>
                      <div className="text-muted-foreground font-mono text-xs break-all">
                        {entry.error}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center space-x-2">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(entry.failed_at).toLocaleString()}</span>
                        <span>•</span>
                        <span>{t('alerts.attemptsExhausted', { count: entry.attempts })}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRetryDeadLetter(entry, retryKey)}
                    disabled={pendingRetryKey === retryKey || running}
                    className="shrink-0 text-xs border-status-error/30 text-status-error hover:bg-status-error/10"
                  >
                    {pendingRetryKey === retryKey ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    )}
                    <span>{t('write.retry')}</span>
                  </Button>
                </div>
              )
            })}
            {deadLetters.length > MAX_VISIBLE_DLQ && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t('common.showing', { shown: MAX_VISIBLE_DLQ, total: deadLetters.length })}
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Batch replay confirmation — ONE dialog per batch. Writing to a PLC
          is dangerous, so nothing is sent until the operator sees the exact
          command list and confirms (the WriteControlPage pattern). */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !running && setConfirmOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-status-error" />
              <span>{t('alerts.replaySelectedTitle', { count: selectedEntries.length })}</span>
            </DialogTitle>
            <DialogDescription>{t('alerts.replaySelectedDesc')}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-56 rounded-lg border border-border bg-muted/40 p-2">
            <div className="space-y-1 font-mono text-xs">
              {selectedEntries.map((dl) => (
                <div key={`confirm-${dlqKeyOf(dl)}`} className="break-all text-foreground">
                  [{dl.command.driver}] {dl.command.tag} = {String(dl.command.value)} (
                  {String(dl.command.type)})
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
            {t('write.confirmWarning')}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={running}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmBatch}
              disabled={running || selectedEntries.length === 0}
            >
              {running ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t('alerts.replaying')}
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  {t('alerts.replaySelectedConfirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
