import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToggleRule } from '@/api/hooks'

/**
 * Per-row rule toggle state with in-flight tracking.
 *
 * Tracks which rules have a pending
 * toggle mutation so the switch is disabled during the request, and surfaces
 * toggle errors.
 *
 * Rules are addressed by name (stable across config reloads) rather than
 * index, which can shift when the rule list changes.
 */
export function useRuleToggle() {
  const { t } = useTranslation()
  const toggleMutation = useToggleRule()
  const [togglingNames, setTogglingNames] = useState<Set<string>>(new Set())
  const [toggleError, setToggleError] = useState<string | null>(null)

  const handleToggle = async (name: string, currentDisabled: boolean) => {
    setTogglingNames((prev) => new Set(prev).add(name))
    setToggleError(null)
    try {
      await toggleMutation.mutateAsync({ name, disabled: !currentDisabled })
    } catch (err) {
      // Catch prevents unhandled rejection; the switch reverts via the next
      // poll. Surface the error so the operator knows why.
      setToggleError(err instanceof Error ? err.message : t('rules.toggleFailed'))
    } finally {
      setTogglingNames((prev) => {
        const next = new Set(prev)
        next.delete(name)
        return next
      })
    }
  }

  return {
    togglingNames,
    toggleError,
    handleToggle,
    clearToggleError: () => setToggleError(null),
  }
}
