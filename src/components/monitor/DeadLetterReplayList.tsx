import {
  AlertCircle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { extractApiError } from '@/api/client'
import { ApiError, useWriteTag } from '@/api/hooks'
import {
  cleanCommandOf,
  DeadLetterReplayDialogs,
  dlqKeyOf,
  labelOf,
  type ReplayOutcome,
} from '@/components/monitor/DeadLetterReplayDialogs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DeadLetterEntry } from '@/types/models'

/** Cap rendered dead letters to prevent DOM overload. */
const MAX_VISIBLE_DLQ = 100

/**
 * Narrow the dead-letter queue by free text (driver/tag) and driver.
 * Exported pure so the row-filtering rules are unit-testable alongside the
 * component (the driver Select itself cannot be driven open in jsdom).
 */
export const filterDeadLetters = (
  entries: DeadLetterEntry[],
  term: string,
  driver: string,
): DeadLetterEntry[] => {
  const q = term.trim().toLowerCase()
  return entries.filter((dl) => {
    if (driver !== 'all' && dl.command.driver !== driver) return false
    if (q) {
      const hay = `${dl.command.driver} ${dl.command.tag}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Deep link into the tag explorer for a failed command, so the
 * operator can check the tag's CURRENT live value before replaying an old
 * write into the PLC (driver+tag prefill, see TagExplorerPage). */
const tagExplorerLinkOf = (id: string | undefined, cmd: DeadLetterEntry['command']): string => {
  const params = `driver=${encodeURIComponent(cmd.driver)}&tag=${encodeURIComponent(cmd.tag)}`
  return id ? `/corec/${id}/monitor/tags?${params}` : `/monitor/tags?${params}`
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
  // Instance-scoped route for the per-entry "View tag" deep link.
  const { id } = useParams<{ id: string }>()
  const writeMutation = useWriteTag()

  // Single-entry retry state (per-row button). The row button only
  // STAGES the entry here; the write fires from the per-entry confirmation
  // dialog below — the same two-step gate the batch replay already uses.
  const [retryError, setRetryError] = useState<string | null>(null)
  const [pendingRetryKey, setPendingRetryKey] = useState<string | null>(null)
  const [pendingReplay, setPendingReplay] = useState<DeadLetterEntry | null>(null)

  // Batch replay state: selection → per-batch confirm dialog → results.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ReplayOutcome[]>([])

  // Locate one driver's failures among hundreds of dead letters.
  const [dlqSearch, setDlqSearch] = useState('')
  const [dlqDriver, setDlqDriver] = useState('all')

  const filteredDeadLetters = useMemo(
    () => filterDeadLetters(deadLetters, dlqSearch, dlqDriver),
    [deadLetters, dlqSearch, dlqDriver],
  )
  const uniqueDlqDrivers = useMemo(
    () => Array.from(new Set(deadLetters.map((dl) => dl.command.driver))).sort(),
    [deadLetters],
  )
  const visibleDeadLetters = useMemo(
    () => filteredDeadLetters.slice(0, MAX_VISIBLE_DLQ),
    [filteredDeadLetters],
  )
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
      setPendingReplay(null)
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
            {/* Search + driver filter — locate one driver's failures
                 among hundreds of queued dead letters. */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pb-1">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  placeholder={t('alerts.searchDeadLetters')}
                  value={dlqSearch}
                  onChange={(e) => setDlqSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Select value={dlqDriver} onValueChange={setDlqDriver}>
                <SelectTrigger
                  className="h-9 w-auto shrink-0 text-xs"
                  aria-label={t('alerts.driverFilter')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('alerts.driverFilterAll')}</SelectItem>
                  {uniqueDlqDrivers.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredDeadLetters.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('alerts.noMatchingDeadLetters')}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAllVisible}
                    aria-label={t('alerts.selectAllDeadLetters', {
                      count: visibleDeadLetters.length,
                    })}
                    disabled={running}
                  />
                  <span className="text-xs text-muted-foreground">
                    {/* The count states which set select-all covers. */}
                    {t('alerts.selectAllDeadLetters', { count: visibleDeadLetters.length })}
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
                          {/* Sub-device of the failed write — same-name tags
                               across devices are only distinguishable by this line. */}
                          <div className="text-xs text-muted-foreground font-mono break-all">
                            {t('common.device')}: {entry.command.device || '-'}
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

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        {/* Confirm the tag's live value before re-sending
                             an old write — one click, no copy/switch/paste. */}
                        <Link
                          to={tagExplorerLinkOf(id, entry.command)}
                          className="flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-primary transition-colors hover:bg-muted/40 hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden />
                          <span>{t('alerts.viewTag')}</span>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingReplay(entry)}
                          disabled={pendingRetryKey === retryKey || running}
                          className="text-xs border-status-error/30 text-status-error hover:bg-status-error/10"
                        >
                          {pendingRetryKey === retryKey ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                          )}
                          <span>{t('write.retry')}</span>
                        </Button>
                      </div>
                    </div>
                  )
                })}
                {filteredDeadLetters.length > MAX_VISIBLE_DLQ && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {/* The "showing X/Y" footer tracks the FILTERED set. */}
                    {t('common.showing', {
                      shown: visibleDeadLetters.length,
                      total: filteredDeadLetters.length,
                    })}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* Replay confirmations (batch + single) — display-only dialogs; the
          staging/flow lives in this component (see DeadLetterReplayDialogs). */}
      <DeadLetterReplayDialogs
        confirmOpen={confirmOpen}
        onConfirmOpenChange={(v) => !running && setConfirmOpen(v)}
        selectedEntries={selectedEntries}
        running={running}
        onConfirmBatch={handleConfirmBatch}
        pendingReplay={pendingReplay}
        writePending={writeMutation.isPending}
        onConfirmSingle={() => {
          const dl = pendingReplay
          if (!dl) return
          void handleRetryDeadLetter(dl, dlqKeyOf(dl))
        }}
        onCancelSingle={() => setPendingReplay(null)}
      />
    </Card>
  )
}
