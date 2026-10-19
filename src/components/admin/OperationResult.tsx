/**
 * OperationResult — the shared transient feedback strip (audit D-17).
 *
 * The "apply config & hot-reload" outcome used to be a page-local,
 * never-clearing text line, spelled three different ways on three pages.
 * This is the ONE strip: success green / error red, an optional context
 * label naming WHICH operation produced it, a 5s auto-fade, and a manual
 * close — so a glance is enough to tell what happened and it does not
 * squat on the page forever.
 *
 * Dismissal is deliberately local: the strip hides itself after the fade
 * or on close, keyed on the status OBJECT's identity — every producer
 * (useEntityEditConfig, useStatusMessage consumers…) sets a fresh object
 * per operation, so repeating the operation re-shows the strip while
 * plain re-renders never restart the timer. Parents that want their state
 * cleared too can pass onDismiss.
 */
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

export interface OperationResultStatus {
  type: 'success' | 'error'
  text: string
}

interface OperationResultProps {
  /** Current operation outcome; null renders nothing. */
  status: OperationResultStatus | null
  /**
   * Operation context (D-17): a short label naming the operation — e.g.
   * the card/section title — so the strip is self-describing when several
   * operations can land on one page.
   */
  context?: React.ReactNode
  /** ms before the strip auto-fades; 0 disables the auto-fade. Default 5000. */
  autoDismissMs?: number
  /** Optional parent-state clear, called when the strip hides (fade or X). */
  onDismiss?: () => void
}

/** The audit's copy: "5s 自动淡出可手关". */
const DEFAULT_AUTO_DISMISS_MS = 5000

export const OperationResult: React.FC<OperationResultProps> = ({
  status,
  context,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  onDismiss,
}) => {
  const { t } = useTranslation()
  // The status object this strip has locally hidden (faded / closed).
  // Keyed on identity, not text: a NEW object — even with identical text,
  // i.e. the operator re-ran the same operation — shows again.
  const [hiddenFor, setHiddenFor] = useState<OperationResultStatus | null>(null)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!status) return
    // A new message object resets any previous local hide.
    setHiddenFor((prev) => (prev === status ? prev : null))
    if (autoDismissMs <= 0) return
    const id = window.setTimeout(() => {
      setHiddenFor(status)
      onDismissRef.current?.()
    }, autoDismissMs)
    return () => window.clearTimeout(id)
  }, [status, autoDismissMs])

  if (!status || hiddenFor === status) return null

  const isError = status.type === 'error'
  const hide = () => {
    setHiddenFor(status)
    onDismissRef.current?.()
  }

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-2 rounded-lg border p-3 text-xs',
        isError
          ? 'border-status-error/20 bg-status-error/10 text-status-error'
          : 'border-status-running/20 bg-status-running/10 text-status-running',
      )}
    >
      {isError ? (
        <AlertCircle className="h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      )}
      {context && (
        <span className="shrink-0 font-medium opacity-80">
          {context}
          <span aria-hidden className="mx-1 opacity-60">
            ·
          </span>
        </span>
      )}
      <span className="break-all flex-1">{status.text}</span>
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={hide}
        className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
