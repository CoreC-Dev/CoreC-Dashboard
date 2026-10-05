/**
 * WizardContextValidationBanner
 *
 * Shared context-validation banner rendered in the preview step of the
 * Driver/Transport/Rule wizards. Shows the first 6 cross-entity validation
 * errors (or a "passed" confirmation when there are none), plus non-blocking
 * warnings (e.g. "no data source / no transport" in idle mode) rendered in
 * amber so the operator sees the core would run in idle mode without the
 * warning blocking the wizard's Finish button.
 *
 * Extracted verbatim from the three wizards — all three used the same JSX
 * and the same `driverWizard.validationErrors` i18n key.
 *
 * The prop type is defined inline (mirroring ConfigValidationResult) to
 * avoid an import cycle with the config-schema module.
 */
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'

interface ContextValidationError {
  path: string
  message: string
}

interface ContextValidation {
  valid: boolean
  errors: ContextValidationError[]
  /** Non-blocking warnings (idle-mode hints). Optional for backward compat. */
  warnings?: ContextValidationError[]
}

export const WizardContextValidationBanner: React.FC<{
  contextValidation: ContextValidation
}> = ({ contextValidation }) => {
  const { t } = useTranslation()
  const hasContextErrors = !contextValidation.valid
  const warnings = contextValidation.warnings ?? []
  const hasWarnings = warnings.length > 0

  return (
    <div
      className={`banner-enter rounded-md border p-2.5 text-xs space-y-1 ${
        hasContextErrors
          ? 'border-status-error/30 bg-status-error/10 text-status-error dark:text-status-error'
          : hasWarnings
            ? 'border-status-warning/30 bg-status-warning/10 text-status-warning dark:text-status-warning'
            : 'border-status-running/30 bg-status-running/10 text-status-running dark:text-status-running'
      }`}
    >
      {hasContextErrors ? (
        <>
          <div className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {t('driverWizard.validationErrors', {
              count: contextValidation.errors.length,
            })}
          </div>
          <ul className="space-y-0.5 ml-5 list-disc">
            {contextValidation.errors.slice(0, 6).map((err, i) => (
              <li key={i} className="font-mono text-xs opacity-90">
                {err.path}: {err.message}
              </li>
            ))}
            {contextValidation.errors.length > 6 && (
              <li className="text-xs opacity-70">
                {t('driverWizard.validationMore', {
                  count: contextValidation.errors.length - 6,
                })}
              </li>
            )}
          </ul>
        </>
      ) : hasWarnings ? (
        <>
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t('driverWizard.validationWarnings', { count: warnings.length })}
          </div>
          <ul className="space-y-0.5 ml-5 list-disc">
            {warnings.slice(0, 6).map((warn, i) => (
              <li key={i} className="font-mono text-xs opacity-90">
                {warn.path}: {warn.message}
              </li>
            ))}
            {warnings.length > 6 && (
              <li className="text-xs opacity-70">
                {t('driverWizard.validationMore', {
                  count: warnings.length - 6,
                })}
              </li>
            )}
          </ul>
        </>
      ) : (
        <div className="flex items-center gap-1.5 font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t('driverWizard.validationPassed')}
        </div>
      )}
    </div>
  )
}
