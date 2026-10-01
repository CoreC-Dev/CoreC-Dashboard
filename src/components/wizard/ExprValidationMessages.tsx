/**
 * ExprValidationMessages
 *
 * Shared renderer for expression-validation result messages (errors +
 * warnings). Extracted from the 4 duplicated inline blocks in RuleWizard
 * and RuleGroupEditor.
 *
 * Two visual variants — the originals differed only in icon vs. text prefix
 * and text size:
 *   - 'icon'   (RuleWizard): AlertCircle icon, text-[10px], flex row.
 *   - 'prefix' (RuleGroupEditor): ⚠ text prefix, text-[9px].
 *
 * Returns null when the result is valid with no warnings, matching the
 * original inline IIFE guards.
 */
import { AlertCircle } from 'lucide-react'
import type React from 'react'

interface ExprValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export const ExprValidationMessages: React.FC<{
  result: ExprValidationResult
  variant?: 'icon' | 'prefix'
}> = ({ result, variant = 'icon' }) => {
  if (result.valid && result.warnings.length === 0) return null

  if (variant === 'prefix') {
    return (
      <div className="space-y-0.5">
        {result.errors.map((err, i) => (
          <p key={`e-${i}`} className="text-[9px] text-destructive">
            ⚠ {err}
          </p>
        ))}
        {result.warnings.map((warn, i) => (
          <p key={`w-${i}`} className="text-[9px] text-status-warning dark:text-status-warning">
            ⚠ {warn}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {result.errors.map((err, i) => (
        <p key={`e-${i}`} className="text-[10px] text-destructive flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          {err}
        </p>
      ))}
      {result.warnings.map((warn, i) => (
        <p
          key={`w-${i}`}
          className="text-[10px] text-status-warning dark:text-status-warning flex items-start gap-1"
        >
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          {warn}
        </p>
      ))}
    </div>
  )
}
