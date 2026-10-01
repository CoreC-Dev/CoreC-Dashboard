/**
 * ValidationBanner
 *
 * Displays live validation errors from the configStore's working config.
 * Shows up to `maxErrors` errors with a "...and N more" truncation.
 *
 * Used by DriversPage, TransportsPage, RulesPage, and ConfigCenterPage
 * to surface zod schema + cross-entity validation errors before the
 * user attempts to apply changes.
 *
 * Consumes useConfigValidation() directly — no props needed. The banner
 * only renders when there are actual errors (hasConfig && !valid).
 */
import { AlertCircle } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigValidation } from '@/hooks/useConfigValidation'

const MAX_ERRORS = 8

export const ValidationBanner: React.FC<{ maxErrors?: number }> = ({ maxErrors = MAX_ERRORS }) => {
  const { t } = useTranslation()
  const validation = useConfigValidation()

  const errorStrings = useMemo(
    () => validation.errors.map((e) => `${e.path}: ${e.message}`),
    [validation.errors],
  )

  if (!validation.hasConfig || validation.valid || errorStrings.length === 0) {
    return null
  }

  return (
    <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error dark:text-status-error space-y-1.5">
      <div className="font-semibold flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5" />
        {t('config.validationErrorsTitle', { count: errorStrings.length })}
      </div>
      <ul className="space-y-0.5 ml-5 list-disc">
        {errorStrings.slice(0, maxErrors).map((err, i) => (
          <li key={i} className="font-mono text-[11px] opacity-90">
            {err}
          </li>
        ))}
        {errorStrings.length > maxErrors && (
          <li className="text-[10px] opacity-70">
            {t('config.validationErrorsMore', { count: errorStrings.length - maxErrors })}
          </li>
        )}
      </ul>
    </div>
  )
}
