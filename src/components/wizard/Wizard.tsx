/**
 * Generic multi-step Wizard component.
 *
 * Underpins the driver/transport/rule creation wizards. Design:
 *   - Controlled by parent via `value` (current step index) and `onValueChange`.
 *   - Each step declares an optional `canProceed` gate (zod validation result,
 *     required-field check, etc.); the Next button is disabled when the gate
 *     fails and an inline hint is shown.
 *   - A `renderPreview` slot lets any step surface the accumulated YAML
 *     at any time (the last step is typically a dedicated preview+apply step).
 *   - Progress is shown as a header bar with step titles + current indicator.
 *   - Keyboard accessible: Back/Next are real buttons; step headers are
 *     buttons when `allowJumpBack` is enabled (click to revisit earlier steps).
 *
 * This component is presentation only — it knows nothing about CoreC config.
 * Config-specific step content lives in features/admin/{drivers,transports,rules}.
 */
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type React from 'react'
import { Fragment, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

export interface WizardStep {
  /** Stable id for keying. */
  id: string
  /** Short title shown in the progress header (i18n key or literal). */
  title: string
  /** Optional one-line subtitle shown under the title in the header. */
  subtitle?: string
  /**
   * Gate predicate. Return false (or { ok: false, reason }) to disable the
   * Next button and show a hint. Called on every render of the current step.
   */
  canProceed?: () => boolean | { ok: false; reason: string }
  /** Step body. Receives nothing — state lives in the parent form. */
  render: () => React.ReactNode
}

interface WizardProps {
  /** Visible steps in order. */
  steps: WizardStep[]
  /** Current step index (0-based). Controlled. */
  current: number
  /** Called when the user attempts to move forward (passes validation gate). */
  onNext: (nextIndex: number) => void
  /** Called when the user moves back. */
  onPrevious: (prevIndex: number) => void
  /** Called when the user clicks Finish (only enabled on the last step). */
  onFinish?: () => void
  /** Called when the user cancels. */
  onCancel?: () => void
  /** Whether the finish action is in progress (disables buttons + shows state). */
  finishing?: boolean
  /** Optional YAML preview node rendered in a collapsible section. */
  previewNode?: React.ReactNode
  /** Dialog title for the wizard shell. */
  dialogTitle: string
  /** When true, clicking an earlier step header navigates back to it. */
  allowJumpBack?: boolean
  /** Extra className for the content area. */
  className?: string
  /**
   * Additional finish gate. When false, the Finish button is disabled even
   * if the current step's canProceed passes. Used by wizards to gate on
   * cross-entity context validation shown in the preview step.
   */
  canFinish?: boolean
}

const Wizard: React.FC<WizardProps> = ({
  steps,
  current,
  onNext,
  onPrevious,
  onFinish,
  onCancel,
  finishing = false,
  previewNode,
  dialogTitle,
  allowJumpBack = true,
  className,
  canFinish = true,
}) => {
  const { t } = useTranslation()
  const total = steps.length
  const step = steps[current]
  const isLast = current === total - 1

  // Evaluate the current step's gate. Memoized per step/render.
  const gate = useMemo(() => {
    if (!step?.canProceed) return { ok: true as const }
    const r = step.canProceed()
    if (r === false) return { ok: false as const, reason: t('wizard.stepHasErrors') }
    if (r === true || r === undefined) return { ok: true as const }
    return r // { ok: false, reason }
  }, [step, t])

  const handleNext = useCallback(() => {
    if (!gate.ok || isLast) return
    onNext(current + 1)
  }, [gate, isLast, current, onNext])

  const handleFinish = useCallback(() => {
    if (!gate.ok || !onFinish) return
    onFinish()
  }, [gate, onFinish])

  const handleBack = useCallback(() => {
    if (current === 0) return
    onPrevious(current - 1)
  }, [current, onPrevious])

  const jumpTo = useCallback(
    (idx: number) => {
      if (!allowJumpBack || idx >= current) return
      onPrevious(idx) // reuse onPrevious for backward navigation
    },
    [allowJumpBack, current, onPrevious],
  )

  return (
    <DialogContent
      className={cn('max-w-3xl max-h-[90vh] flex flex-col', className)}
      onEscapeKeyDown={(e) => {
        if (finishing) {
          // Prevent closing mid-apply (non-atomic hot-reload in flight).
          e.preventDefault()
        } else if (onCancel) {
          onCancel()
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
        <p className="text-xs text-muted-foreground">
          {t('wizard.step', { current: current + 1, total })}
        </p>
      </DialogHeader>

      {/* Progress header */}
      <div className="flex items-center gap-1 px-1 overflow-x-auto">
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          const clickable = allowJumpBack && i < current
          return (
            <Fragment key={s.id}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => jumpTo(i)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap',
                  active && 'bg-primary/10 text-primary border border-primary/30',
                  done && !active && 'text-muted-foreground hover:bg-accent cursor-pointer',
                  !done && !active && 'text-muted-foreground/50',
                  !clickable && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full text-xs border',
                    active && 'border-primary text-primary',
                    done && !active && 'border-status-running/40 text-status-running',
                    !done && !active && 'border-muted-foreground/30',
                  )}
                >
                  {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                <span>{s.title}</span>
              </button>
              {i < steps.length - 1 && (
                <div
                  className={cn('h-px w-4 sm:w-8', done ? 'bg-status-running/40' : 'bg-border')}
                />
              )}
            </Fragment>
          )
        })}
      </div>

      {/* Step body */}
      <div className="flex-1 overflow-y-auto px-1 py-2 min-h-[200px]">
        {step?.subtitle && <p className="text-xs text-muted-foreground mb-3">{step.subtitle}</p>}
        {step?.render()}
      </div>

      {/* Optional live preview */}
      {previewNode && (
        <div className="border-t pt-3">
          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none flex items-center gap-1">
              <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
              {t('wizard.preview')}
            </summary>
            <div className="details-reveal mt-2 max-h-48 overflow-auto rounded-md bg-muted/40 border p-2">
              {previewNode}
            </div>
          </details>
        </div>
      )}

      {/* Gate hint */}
      {!gate.ok && (
        <p className="text-xs text-status-warning flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-warning" />
          {gate.reason}
        </p>
      )}

      {/* Footer */}
      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={finishing} className="h-8">
          {t('wizard.cancel')}
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          disabled={current === 0 || finishing}
          className="h-8"
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-1" />
          {t('wizard.previous')}
        </Button>
        {isLast ? (
          <Button
            size="sm"
            onClick={handleFinish}
            disabled={!gate.ok || !canFinish || finishing}
            className="h-8"
          >
            {t('wizard.finish')}
          </Button>
        ) : (
          <Button size="sm" onClick={handleNext} disabled={!gate.ok || finishing} className="h-8">
            {t('wizard.next')}
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

/** Convenience wrapper: Wizard inside its own Dialog shell (open/onOpenChange). */
interface WizardDialogProps extends WizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const WizardDialog: React.FC<WizardDialogProps> = ({
  open,
  onOpenChange,
  onCancel,
  ...wizardProps
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? undefined : onCancel ? onCancel() : onOpenChange(false))}
    >
      <Wizard
        {...wizardProps}
        onCancel={() => {
          onCancel?.()
          onOpenChange(false)
        }}
      />
    </Dialog>
  )
}
