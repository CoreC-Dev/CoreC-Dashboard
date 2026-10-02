import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToggleRule } from '@/api/hooks'

/**
 * Per-row rule toggle state with in-flight tracking.
 *
 * Extracted from RulesPage (TD-CPLX-003). Tracks which rows have a pending
 * toggle mutation so the switch is disabled during the request, and surfaces
 * toggle errors. [M-5]
 */
export function useRuleToggle() {
  const { t } = useTranslation()
  const toggleMutation = useToggleRule()
  const [togglingIndices, setTogglingIndices] = useState<Set<number>>(new Set())
  const [toggleError, setToggleError] = useState<string | null>(null)

  const handleToggle = async (index: number, currentDisabled: boolean) => {
    setTogglingIndices((prev) => new Set(prev).add(index))
    setToggleError(null)
    try {
      await toggleMutation.mutateAsync({ index, disabled: !currentDisabled })
    } catch (err) {
      // Catch prevents unhandled rejection; the switch reverts via the next
      // poll. Surface the error so the operator knows why.
      setToggleError(err instanceof Error ? err.message : t('rules.toggleFailed'))
    } finally {
      setTogglingIndices((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  return {
    togglingIndices,
    toggleError,
    handleToggle,
    clearToggleError: () => setToggleError(null),
  }
}
