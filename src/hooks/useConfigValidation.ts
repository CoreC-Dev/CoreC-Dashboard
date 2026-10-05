/**
 * Config Validation & Selector Hooks
 *
 * Bridges the configStore (working copy state) with configSchema (zod
 * validation) and settingsRegistry (field metadata). These hooks are
 * consumed by wizard pages and the ConfigApplyConfirmationDialog to
 * show validation errors and dynamic option lists reactively.
 *
 * Decision-independent: they read from the local configStore, which works
 * identically under backend path A (loaded from GET /configs/raw) and
 * path B (loaded from uploaded YAML).
 */
import { useMemo } from 'react'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { type ConfigValidationResult, validateFullConfig } from '@/lib/configSchema'
import { useConfigStore } from '@/stores/configStore'

/**
 * Runs `validateFullConfig` on the configStore's workingConfig and
 * returns the result. Recomputes only when the workingConfig reference
 * changes (Zustand returns a new object on every mutation, so this is
 * naturally reactive).
 *
 * Returns `{ valid: true }` when there's no working config loaded.
 */
export function useConfigValidation(): ConfigValidationResult & { hasConfig: boolean } {
  const workingConfig = useConfigStore((s) => s.workingConfig)
  // Debounce validation to avoid running full zod validateFullConfig on every
  // keystroke in form mode (TD-PERF-003). Mirrors the YAML diff debounce pattern.
  const debouncedConfig = useDebouncedValue(workingConfig, 200)

  return useMemo(() => {
    if (!debouncedConfig) {
      return { valid: true, errors: [], warnings: [], hasConfig: false }
    }
    const result = validateFullConfig(debouncedConfig)
    return { ...result, hasConfig: true }
  }, [debouncedConfig])
}

/**
 * Format a validation result into the `path: message` string list used by
 * apply-confirmation dialogs and apply buttons, or `undefined` when there
 * are no errors to show. Shared by the Drivers/Transports/Rules/Config pages
 * so the mapping lives in one place.
 */
export function formatValidationErrors(
  validation: ConfigValidationResult & { hasConfig: boolean },
): string[] | undefined {
  return validation.hasConfig && !validation.valid
    ? validation.errors.map((e) => `${e.path}: ${e.message}`)
    : undefined
}

/**
 * Format a validation result's non-blocking warnings into a `path: message`
 * string list, or `undefined` when there are no warnings. Used by
 * apply-confirmation dialogs to show idle-mode hints (no data source / no
 * transport) without blocking the apply.
 */
export function formatValidationWarnings(
  validation: ConfigValidationResult & { hasConfig: boolean },
): string[] | undefined {
  const warnings = validation.warnings ?? []
  return validation.hasConfig && warnings.length > 0
    ? warnings.map((e) => `${e.path}: ${e.message}`)
    : undefined
}

/**
 * Returns the list of transport names from the working config.
 * Used by SettingsFieldRenderer for the `fallback` select field and
 * by the rule wizard for the `target`/`targets` select fields.
 */
export function useTransportNames(): string[] {
  const workingConfig = useConfigStore((s) => s.workingConfig)
  return useMemo(() => {
    return (workingConfig?.transports ?? []).map((t) => t.name)
  }, [workingConfig])
}
