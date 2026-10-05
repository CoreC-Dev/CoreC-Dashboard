/**
 * ValidationBanner
 *
 * Displays live validation errors and idle-mode warnings from the
 * configStore's working config. Shows up to `maxErrors` errors (red) and
 * up to `maxErrors` warnings (amber) with a "...and N more" truncation.
 *
 * Used by DriversPage, TransportsPage, RulesPage, and ConfigCenterPage
 * to surface zod schema + cross-entity validation issues before the
 * user attempts to apply changes.
 *
 * Consumes useConfigValidation() directly — no props needed. The error
 * banner only renders when there are actual errors (hasConfig && !valid).
 * The warning banner renders when the config is valid but has idle-mode
 * warnings (hasConfig && valid && warnings.length > 0).
 */
import { AlertCircle, AlertTriangle } from 'lucide-react'
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

  const warningStrings = useMemo(
    () => (validation.warnings ?? []).map((e) => `${e.path}: ${e.message}`),
    [validation.warnings],
  )

  if (!validation.hasConfig) {
    return null
  }

  const hasErrors = !validation.valid && errorStrings.length > 0
  const hasWarnings = validation.valid && warningStrings.length > 0

  if (!hasErrors && !hasWarnings) {
    return null
  }

  return (
    <div className="space-y-2">
      {hasErrors && (
        <div className="banner-enter rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error dark:text-status-error space-y-1.5">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {t('config.validationErrorsTitle', { count: errorStrings.length })}
          </div>
          <ul className="space-y-0.5 ml-5 list-disc">
            {errorStrings.slice(0, maxErrors).map((err, i) => (
              <li key={i} className="font-mono text-xs opacity-90">
                {err}
              </li>
            ))}
            {errorStrings.length > maxErrors && (
              <li className="text-xs opacity-70">
                {t('config.validationErrorsMore', { count: errorStrings.length - maxErrors })}
              </li>
            )}
          </ul>
        </div>
      )}
      {hasWarnings && (
        <div className="banner-enter rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning dark:text-status-warning space-y-1.5">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t('config.validationWarningsTitle', { count: warningStrings.length })}
          </div>
          <ul className="space-y-0.5 ml-5 list-disc">
            {warningStrings.slice(0, maxErrors).map((warn, i) => (
              <li key={i} className="font-mono text-xs opacity-90">
                {warn}
              </li>
            ))}
            {warningStrings.length > maxErrors && (
              <li className="text-xs opacity-70">
                {t('config.validationErrorsMore', { count: warningStrings.length - maxErrors })}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
