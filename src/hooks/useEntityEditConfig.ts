import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw, useUpdateConfig } from '@/api/hooks'
import { parseConfigYaml } from '@/lib/configYaml'
import type { CoreCConfig } from '@/types/config'

/**
 * Shared edit-config state management for entity detail pages.
 *
 * Extracted from DriverEditConfigSection and TransportEditConfigSection
 * (TD-DUP-002) — both had identical useState/useEffect/useMemo/handleReload
 * logic with only the entity lookup and YAML builders differing.
 *
 * The caller provides entity-specific logic via options; the hook manages
 * open/values/statusMsg state, pre-fill, preview/apply YAML, and reload.
 */
interface UseEntityEditConfigOptions<TField extends { key: string }> {
  /** Entity name (used for React Query keys, not internally). */
  entityName: string
  /** Editable fields for this entity type. */
  fields: readonly TField[]
  /** Extract field values from the parsed config for pre-fill.
   *  Return null to skip pre-fill (entity not found, no settings, etc.). */
  prefillValues: (cfg: CoreCConfig) => Record<string, string> | null
  /** Build the preview YAML (just this entity's section, readable for the operator). */
  buildPreviewYaml: (fields: readonly TField[], values: Record<string, string>) => string
  /** Build the apply YAML (merge edited entity into full config).
   *  Receives the raw YAML string and previewYaml as fallback. */
  buildApplyYaml: (
    rawYaml: string,
    fields: readonly TField[],
    values: Record<string, string>,
    previewYaml: string,
  ) => string
  /** i18n key for the success message. */
  successKey: string
  /** i18n key for the failure message fallback. */
  failureKey: string
}

/** State managed by useEntityEditConfig — passed to EntityEditConfigCard as a single prop. */
export interface EntityEditConfigState {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  values: Record<string, string>
  setField: (key: string, v: string) => void
  previewYaml: string
  applyYaml: string
  statusMsg: { type: 'success' | 'error'; text: string } | null
  handleReload: () => Promise<void>
  isReloading: boolean
}

export function useEntityEditConfig<TField extends { key: string }>(
  options: UseEntityEditConfigOptions<TField>,
) {
  const { fields, prefillValues, buildPreviewYaml, buildApplyYaml, successKey, failureKey } =
    options

  const { t } = useTranslation()
  const updateConfig = useUpdateConfig()
  const { data: rawYaml } = useConfigRaw()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) init[f.key] = ''
    return init
  })
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  // Pre-fill form from the existing server config.
  useEffect(() => {
    if (!rawYaml) return
    try {
      const cfg = parseConfigYaml(rawYaml)
      const filled = prefillValues(cfg)
      if (filled) setValues(filled)
    } catch {
      // If YAML parse fails, leave the form empty — don't crash the page.
    }
  }, [rawYaml, prefillValues])

  const previewYaml = useMemo(
    () => buildPreviewYaml(fields, values),
    [fields, values, buildPreviewYaml],
  )

  const applyYaml = useMemo(() => {
    if (!rawYaml) return previewYaml
    try {
      return buildApplyYaml(rawYaml, fields, values, previewYaml)
    } catch {
      return previewYaml
    }
  }, [rawYaml, fields, values, previewYaml, buildApplyYaml])

  const setField = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const handleReload = async () => {
    setStatusMsg(null)
    try {
      await updateConfig.mutateAsync({ payload: applyYaml })
      setStatusMsg({ type: 'success', text: t(successKey) })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setStatusMsg({
        type: 'error',
        text: msg || t(failureKey),
      })
    }
  }

  return {
    open,
    setOpen,
    values,
    setField,
    previewYaml,
    applyYaml,
    statusMsg,
    handleReload,
    isReloading: updateConfig.isPending,
  }
}
