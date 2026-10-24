import { Upload } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
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
import { cn } from '@/lib/cn'
import { useInstanceStore } from '@/stores/instanceStore'

/**
 * Import dialog for CoreC instance configs — drag & drop, file browse and
 * paste, one behavior for every entry point (the homepage offered
 * drag & drop + file browse while the settings page had a bare textarea for
 * the exact same operation).
 *
 * Outcome classification: the store's importInstances returns
 * {added, skipped, invalid, parseError}; each story gets its own copy — a
 * clean import shows a brief green confirmation and auto-closes, anything
 * mixed keeps the dialog open so the breakdown stays readable.
 */
type ImportFeedback = {
  /** success: entries were added; partial: some/all entries skipped or invalid; error: nothing imported */
  tone: 'success' | 'partial' | 'error'
  message: string
}

const FEEDBACK_TONE_CLASS: Record<ImportFeedback['tone'], string> = {
  success: 'text-status-running',
  partial: 'text-status-warning',
  error: 'text-status-error',
}

/** How long a clean success stays visible before the dialog closes. */
const IMPORT_SUCCESS_CLOSE_MS = 1500

interface InstanceImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const InstanceImportDialog: React.FC<InstanceImportDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useTranslation()
  const importInstances = useInstanceStore((s) => s.importInstances)

  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const successCloseTimer = useRef<number | null>(null)

  const clearImportTimer = () => {
    if (successCloseTimer.current !== null) {
      window.clearTimeout(successCloseTimer.current)
      successCloseTimer.current = null
    }
  }

  // Never leak the pending success-close timer past unmount. (Inlined
  // rather than calling clearImportTimer: the unmount cleanup must not
  // depend on a per-render closure.)
  useEffect(
    () => () => {
      if (successCloseTimer.current !== null) window.clearTimeout(successCloseTimer.current)
    },
    [],
  )

  /** Every (re)open is a fresh session — a previous payload or verdict
   * must not linger; every close defuses any pending auto-close timer. */
  const handleOpenChange = (next: boolean) => {
    clearImportTimer()
    if (next) {
      setText('')
      setFeedback(null)
    }
    onOpenChange(next)
  }

  const handleImport = () => {
    clearImportTimer()
    const result = importInstances(text, 'merge')
    if (result.parseError) {
      // The payload itself was unusable (not JSON / not an array / forbidden
      // keys) — previously this was reported as "added 0, skipped 0".
      setFeedback({ tone: 'error', message: t('instances.importInvalid') })
      return
    }
    if (result.added > 0 && result.skipped === 0 && result.invalid === 0) {
      // Clean import: show a brief confirmation instead of closing silently,
      // then close the dialog.
      setFeedback({
        tone: 'success',
        message: t('instances.importSuccess', { added: result.added }),
      })
      successCloseTimer.current = window.setTimeout(
        () => handleOpenChange(false),
        IMPORT_SUCCESS_CLOSE_MS,
      )
      return
    }
    if (result.added > 0 || (result.skipped > 0 && result.invalid > 0)) {
      setFeedback({
        tone: 'partial',
        message: t('instances.importPartial', {
          added: result.added,
          skipped: result.skipped,
          invalid: result.invalid,
        }),
      })
      return
    }
    if (result.skipped > 0) {
      setFeedback({
        tone: 'partial',
        message: t('instances.importAllSkipped', { skipped: result.skipped }),
      })
      return
    }
    if (result.invalid > 0) {
      // Valid JSON array, but every entry failed per-entry validation.
      setFeedback({ tone: 'error', message: t('instances.importInvalid') })
      return
    }
    // Valid JSON, empty array — nothing happened, nothing to complain about.
    setFeedback({
      tone: 'partial',
      message: t('instances.importResult', { added: 0, skipped: 0 }),
    })
  }

  const handleFileRead = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setText(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => {
      setFeedback({
        tone: 'error',
        message: t('instances.importFileError', { error: reader.error?.message ?? '' }),
      })
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileRead(file)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('instances.importTitle')}</DialogTitle>
          <DialogDescription>{t('instances.importDesc')}</DialogDescription>
        </DialogHeader>
        {/* Drop zone + file browse */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`w-full cursor-pointer rounded-md border-2 border-dashed p-4 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
        >
          <Upload className="w-5 h-5 mx-auto mb-1.5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('instances.importDrop')}</p>
          <p className="text-xs text-primary font-medium mt-1">{t('instances.importBrowse')}</p>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFileRead(f)
            e.target.value = ''
          }}
        />
        {/* Paste textarea */}
        <p className="text-xs text-muted-foreground">{t('instances.importOrPaste')}</p>
        <textarea
          className="w-full h-32 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={t('instances.importTitle')}
          placeholder='[{"id":"inst_...","name":"...","baseUrl":"...","secret":"..."}]'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {feedback && (
          <p role="status" className={cn('text-sm', FEEDBACK_TONE_CLASS[feedback.tone])}>
            {feedback.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleImport} disabled={!text.trim()}>
            {t('instances.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
