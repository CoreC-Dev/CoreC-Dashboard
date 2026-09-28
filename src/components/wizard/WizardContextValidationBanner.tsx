/**
 * WizardContextValidationBanner
 *
 * Shared context-validation banner rendered in the preview step of the
 * Driver/Transport/Rule wizards. Shows the first 6 cross-entity validation
 * errors (or a "passed" confirmation when there are none).
 *
 * Extracted verbatim from the three wizards — all three used the same JSX
 * and the same `driverWizard.validationErrors` i18n key.
 *
 * The prop type is defined inline (mirroring ConfigValidationResult) to
 * avoid an import cycle with the config-schema module.
 */
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'

interface ContextValidationError {
  path: string
  message: string
}

interface ContextValidation {
  valid: boolean
  errors: ContextValidationError[]
}

export const WizardContextValidationBanner: React.FC<{
  contextValidation: ContextValidation
}> = ({ contextValidation }) => {
  const { t } = useTranslation()
  const hasContextErrors = !contextValidation.valid

  return (
    <div
      className={`rounded-md border p-2.5 text-xs space-y-1 ${
        hasContextErrors
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
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
              <li key={i} className="font-mono text-[10px] opacity-90">
                {err.path}: {err.message}
              </li>
            ))}
            {contextValidation.errors.length > 6 && (
              <li className="text-[9px] opacity-70">
                {t('driverWizard.validationMore', {
                  count: contextValidation.errors.length - 6,
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
