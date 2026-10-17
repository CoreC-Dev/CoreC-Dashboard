import { CheckCircle2, Layers, Loader2, Plus, Send, Trash2 } from 'lucide-react'
import type React from 'react'
import { Fragment, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { extractApiError } from '@/api/client'
import { ApiError, useWriteTag } from '@/api/hooks'
import { TagCombobox } from '@/components/admin/WriteControlParts'
import { Badge } from '@/components/ui/badge'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DataTypeString } from '@/lib/constants'
import { parseWriteValue, validateValue } from '@/lib/writeValidation'
import { DATA_TYPES } from '@/types/config'
import type { WriteCommand } from '@/types/models'

/** Bound the batch table — a batch write is an operator-reviewed list, not a spreadsheet. */
const MAX_ROWS = 20

/** One editable row of the batch table (raw string value until submit). */
interface BatchRow {
  id: number
  driver: string
  tag: string
  value: string
  type: DataTypeString
}

/** Per-row outcome after a confirmed batch run. */
interface BatchOutcome {
  rowId: number
  index: number
  label: string
  ok: boolean
  error?: string
}

interface BatchWritePanelProps {
  drivers: { name: string; type: string }[]
  /** Configured tags per driver — feeds the TagCombobox suggestions. */
  driverTags: Map<string, { name: string; type: string }[]>
}

const newRow = (id: number): BatchRow => ({
  id,
  driver: '',
  tag: '',
  value: '',
  type: 'float32',
})

/**
 * Batch mode of the Write Control page — compose several write commands as
 * a table and dispatch them in one confirmed run.
 *
 * Safety mirrors the single-write path exactly: submit only STAGES the
 * commands and opens a confirmation dialog listing every one; only its
 * destructive confirm fires the writes, one by one through the existing
 * POST /write mutation, and each row's outcome is rendered afterwards
 * (success / verbatim failure) so the operator sees exactly what hit the
 * PLC.
 */
export const BatchWritePanel: React.FC<BatchWritePanelProps> = ({ drivers, driverTags }) => {
  const { t } = useTranslation()
  const writeMutation = useWriteTag()
  const nextIdRef = useRef(1)

  const [rows, setRows] = useState<BatchRow[]>(() => [newRow(0)])
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingCommands, setPendingCommands] = useState<WriteCommand[]>([])
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<BatchOutcome[]>([])

  const updateRow = (id: number, patch: Partial<BatchRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setRowErrors((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return
    setRows((prev) => [...prev, newRow(nextIdRef.current++)])
  }

  const removeRow = (id: number) => {
    setResults([])
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)))
  }

  /** Row-level validation — same rules as the single-write form. */
  const validateRow = (row: BatchRow): string | null => {
    if (!row.driver || !row.tag) return t('write.batchRowMissing')
    return validateValue(row.value, row.type, t)
  }

  const labelOf = (cmd: WriteCommand): string => `[${cmd.driver}] ${cmd.tag} = ${String(cmd.value)}`

  const handleSubmit = () => {
    setResults([])
    const errors = new Map<number, string>()
    rows.forEach((row) => {
      const err = validateRow(row)
      if (err) errors.set(row.id, err)
    })
    if (errors.size > 0) {
      setRowErrors(errors)
      return
    }
    setPendingCommands(
      rows.map((row) => ({
        driver: row.driver,
        tag: row.tag,
        type: row.type,
        value: parseWriteValue(row.value, row.type),
      })),
    )
    setConfirmOpen(true)
  }

  const writeErrorMsg = (err: unknown): string => {
    if (err instanceof ApiError && err.body) {
      return extractApiError(err.body, t('write.unknownError'))
    }
    return err instanceof Error ? err.message : t('write.unknownError')
  }

  // Confirmed batch: write every staged command ONE BY ONE and record each
  // row's outcome — a failed row does not abort the rest.
  const handleConfirmBatch = async () => {
    if (pendingCommands.length === 0 || running) return
    setRunning(true)
    const outcomes: BatchOutcome[] = []
    for (let i = 0; i < pendingCommands.length; i++) {
      const cmd = pendingCommands[i]
      try {
        await writeMutation.mutateAsync(cmd)
        outcomes.push({ rowId: rows[i]?.id ?? i, index: i, label: labelOf(cmd), ok: true })
      } catch (err: unknown) {
        outcomes.push({
          rowId: rows[i]?.id ?? i,
          index: i,
          label: labelOf(cmd),
          ok: false,
          error: writeErrorMsg(err),
        })
      }
    }
    setResults(outcomes)
    setRunning(false)
    setConfirmOpen(false)
  }

  return (
    <Card className="lg:col-span-2 border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center space-x-2">
          <Layers className="w-4 h-4 text-primary" />
          <span>{t('write.batchTitle')}</span>
        </CardTitle>
        <CardDescription className="text-xs">{t('write.batchDesc')}</CardDescription>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {results.length > 0 && (
          <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1.5">
            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t('write.batchResults')}</span>
              <span className="text-muted-foreground font-mono font-normal">
                {t('alerts.replayBatchDone', {
                  ok: results.filter((r) => r.ok).length,
                  failed: results.filter((r) => !r.ok).length,
                })}
              </span>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {results.map((r) => (
                <div
                  key={`batch-result-${r.rowId}`}
                  className="flex items-center gap-2 text-xs font-mono"
                >
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

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border uppercase font-semibold text-muted-foreground tracking-wider">
              <tr>
                <th className="px-2 py-2 text-left">{t('common.driver')}</th>
                <th className="px-2 py-2 text-left">{t('common.tag')}</th>
                <th className="px-2 py-2 text-left">{t('write.dataType')}</th>
                <th className="px-2 py-2 text-left">{t('common.value')}</th>
                <th className="w-8 px-2 py-2" aria-label={t('write.batchRemoveRow')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row, index) => {
                const availableTags = row.driver ? (driverTags.get(row.driver) ?? []) : []
                const error = rowErrors.get(row.id)
                return (
                  <Fragment key={row.id}>
                    <tr className={error ? 'bg-status-error/5' : undefined}>
                      <td className="px-2 py-2 align-top min-w-32">
                        <Select
                          value={row.driver}
                          onValueChange={(v) => updateRow(row.id, { driver: v, tag: '' })}
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                      </td>
                      <td className="px-2 py-2 align-top min-w-36">
                        <TagCombobox
                          value={row.tag}
                          onChange={(v) => updateRow(row.id, { tag: v })}
                          availableTags={availableTags}
                          onTypeChange={(ty) => updateRow(row.id, { type: ty as DataTypeString })}
                          placeholder={t('write.tagPlaceholder')}
                        />
                      </td>
                      <td className="px-2 py-2 align-top min-w-28">
                        <Select
                          value={row.type}
                          onValueChange={(v) => updateRow(row.id, { type: v as DataTypeString })}
                        >
                          <SelectTrigger className="h-8 font-mono text-xs">
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
                      </td>
                      <td className="px-2 py-2 align-top min-w-28">
                        <Input
                          value={row.value}
                          onChange={(e) => updateRow(row.id, { value: e.target.value })}
                          placeholder={t('write.valuePlaceholder')}
                          className="h-8 font-mono text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length <= 1 || running}
                          aria-label={t('write.batchRemoveRow')}
                          className="h-7 w-7 text-muted-foreground hover:text-status-error"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                    {error && (
                      <tr className="bg-status-error/5">
                        <td colSpan={5} className="px-2 pb-2 pt-0 text-status-error break-all">
                          {t('write.batchRowError', { index: index + 1, error })}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
          {t('write.confirmWarning')}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={rows.length >= MAX_ROWS || running}
          className="h-8 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          <span>{t('write.batchAddRow')}</span>
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={running || confirmOpen}
          className="h-9 font-semibold flex items-center space-x-2 glow-primary"
        >
          <span>{t('write.batchSubmit')}</span>
          <Send className="w-3.5 h-3.5" />
        </Button>
      </CardFooter>

      {/* Batch confirmation — every command is listed before anything is
          written; the destructive confirm is the only trigger. */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !running && setConfirmOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-status-warning" />
              <span>{t('write.batchConfirmTitle')}</span>
            </DialogTitle>
            <DialogDescription>
              {t('write.batchConfirmDesc', { count: pendingCommands.length })}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-56 rounded-lg border border-border bg-muted/40 p-2">
            <div className="space-y-1 font-mono text-xs">
              {pendingCommands.map((cmd, i) => (
                <div key={`batch-confirm-${i}`} className="break-all text-foreground">
                  {labelOf(cmd)} ({String(cmd.type)})
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
              disabled={running || pendingCommands.length === 0}
            >
              {running ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t('write.batchWriting')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {t('write.batchConfirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
