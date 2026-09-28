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

  return useMemo(() => {
    if (!workingConfig) {
      return { valid: true, errors: [], hasConfig: false }
    }
    const result = validateFullConfig(workingConfig)
    return { ...result, hasConfig: true }
  }, [workingConfig])
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

/**
 * Returns the list of driver names from the working config.
 * Reserved for future use (e.g. rule match field suggestions).
 */
export function useDriverNames(): string[] {
  const workingConfig = useConfigStore((s) => s.workingConfig)
  return useMemo(() => {
    return (workingConfig?.drivers ?? []).map((d) => d.name)
  }, [workingConfig])
}

/**
 * Returns the list of rule names from the working config.
 * Used for rule name uniqueness checks in the wizard.
 */
export function useRuleNames(): string[] {
  const workingConfig = useConfigStore((s) => s.workingConfig)
  return useMemo(() => {
    return (workingConfig?.rules ?? []).map((r) => r.name)
  }, [workingConfig])
}

/**
 * Returns the dirty state and error from the configStore.
 * Convenience selector for components that need to show a "unsaved
 * changes" indicator.
 */
export function useConfigDirty(): { dirty: boolean; error: string | null } {
  const dirty = useConfigStore((s) => s.dirty)
  const error = useConfigStore((s) => s.error)
  return { dirty, error }
}

/**
 * Returns the YAML strings for both working and saved configs.
 * Used by ConfigApplyConfirmationDialog to show the diff.
 */
export function useConfigYamlPair(): {
  workingYaml: string | null
  savedYaml: string | null
} {
  const getWorkingYaml = useConfigStore((s) => s.getWorkingYaml)
  const getSavedYaml = useConfigStore((s) => s.getSavedYaml)

  // We need to re-read these when the workingConfig/savedConfig change.
  // Since Zustand getters are stable, we subscribe to the underlying state.
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const savedConfig = useConfigStore((s) => s.savedConfig)

  return useMemo(() => {
    // The getters read current state, but we include workingConfig/savedConfig
    // in the dependency array so this recomputes when they change.
    void workingConfig
    void savedConfig
    return {
      workingYaml: getWorkingYaml(),
      savedYaml: getSavedYaml(),
    }
  }, [workingConfig, savedConfig, getWorkingYaml, getSavedYaml])
}
