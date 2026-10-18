import { Clock, Loader2, RotateCcw } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DeadLetterEntry, WriteCommand } from '@/types/models'

/**
 * Shared pure helpers for the dead-letter replay UI (B06/B10). Exported so
 * the list and the dialogs share ONE labeling rule — a command listed in a
 * confirm dialog must render exactly like the same command in the results.
 */

/** Stable key for a dead-letter entry (driver + tag + failed_at + attempts). */
export const dlqKeyOf = (dl: DeadLetterEntry): string =>
  `${dl.command.driver}-${dl.command.tag}-${dl.failed_at}-${dl.attempts}`

/** Composite command prefix `[driver/device]` — same-name tags on different
 *  sub-devices must stay distinguishable everywhere a command is listed (B06).
 *  Single-device drivers render the unchanged `[driver]`. */
export const commandPrefixOf = (cmd: WriteCommand): string =>
  `[${cmd.driver}${cmd.device ? `/${cmd.device}` : ''}]`

/** Short human label of a dead letter's command, used in dialogs and results. */
export const labelOf = (dl: DeadLetterEntry): string =>
  `${commandPrefixOf(dl.command)} ${dl.command.tag} = ${String(dl.command.value)}`

/**
 * Re-issues a dead letter via the existing POST /write. Builds a CLEAN
 * command (driver/device/tag/value/type only): the recorded command carries
 * the server-stamped source/remote audit fields, which POST /write re-stamps
 * at its own trust boundary anyway.
 */
export const cleanCommandOf = (dl: DeadLetterEntry): WriteCommand => ({
  driver: dl.command.driver,
  device: dl.command.device,
  tag: dl.command.tag,
  value: dl.command.value,
  type: dl.command.type,
})

/** Per-item outcome of a batch replay. */
export interface ReplayOutcome {
  key: string
  label: string
  ok: boolean
  error?: string
}

interface DeadLetterReplayDialogsProps {
  /** Batch replay confirmation — ONE dialog per batch (parent owns the flow). */
  confirmOpen: boolean
  onConfirmOpenChange: (open: boolean) => void
  selectedEntries: DeadLetterEntry[]
  running: boolean
  onConfirmBatch: () => void
  /** Single replay confirmation — the same two-step gate per entry (C-C1). */
  pendingReplay: DeadLetterEntry | null
  writePending: boolean
  onConfirmSingle: () => void
  onCancelSingle: () => void
}

/**
 * The two replay CONFIRMATION dialogs (batch + single), extracted from
 * DeadLetterReplayList to keep it under the 500-line ceiling. Display-only:
 * the dangerous-action FLOW (selection → staging → confirm → per-item
 * results) stays in the parent — these dialogs only render the exact command
 * list and fire the provided confirm/cancel callbacks. Writing to a PLC is
 * dangerous, so nothing here can trigger a write on its own.
 */
export const DeadLetterReplayDialogs: React.FC<DeadLetterReplayDialogsProps> = ({
  confirmOpen,
  onConfirmOpenChange,
  selectedEntries,
  running,
  onConfirmBatch,
  pendingReplay,
  writePending,
  onConfirmSingle,
  onCancelSingle,
}) => {
  const { t } = useTranslation()

  return (
    <>
      {/* Batch replay confirmation — ONE dialog per batch. Writing to a PLC
          is dangerous, so nothing is sent until the operator sees the exact
          command list and confirms (the WriteControlPage pattern). */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !running && onConfirmOpenChange(v)}>
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
                  {commandPrefixOf(dl.command)} {dl.command.tag} = {String(dl.command.value)} (
                  {String(dl.command.type)})
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
            {t('write.confirmWarning')}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onConfirmOpenChange(false)} disabled={running}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmBatch}
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

      {/* Single replay confirmation — ONE dialog per entry, the same
          two-step gate as the batch (C-C1). A dead letter's last write
          already FAILED, so nothing is re-sent until the operator has seen
          the exact command, its failure time/error, and confirmed. */}
      <Dialog
        open={pendingReplay !== null}
        onOpenChange={(v) => !writePending && !v && onCancelSingle()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-status-error" />
              <span>{t('alerts.replayOneTitle')}</span>
            </DialogTitle>
            <DialogDescription>
              {t('alerts.replayOneDesc', { error: pendingReplay?.error ?? '' })}
            </DialogDescription>
          </DialogHeader>

          {pendingReplay && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
              <div className="break-all font-mono text-xs text-foreground">
                {commandPrefixOf(pendingReplay.command)} {pendingReplay.command.tag} ={' '}
                {String(pendingReplay.command.value)} ({String(pendingReplay.command.type)})
              </div>
              <div className="text-xs text-muted-foreground flex items-center space-x-2">
                <Clock className="w-3 h-3" />
                <span>{new Date(pendingReplay.failed_at).toLocaleString()}</span>
                <span>•</span>
                <span>{t('alerts.attemptsExhausted', { count: pendingReplay.attempts })}</span>
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
            {t('write.confirmWarning')}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onCancelSingle} disabled={writePending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={writePending || !pendingReplay}
              onClick={onConfirmSingle}
            >
              {writePending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t('alerts.replaying')}
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  {t('write.replayConfirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
