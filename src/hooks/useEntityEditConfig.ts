import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw, useUpdateConfig } from '@/api/hooks'
import { parseConfigYaml } from '@/lib/configYaml'
import { useConfigHistoryStore } from '@/stores/configHistoryStore'
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
 *
 * C-A4: fields tagged kind 'password' are never pre-filled with the
 * stored secret. A saved value is recorded in `secretSavedKeys` and the
 * form value stays '' — the card shows a "saved — leave blank to keep"
 * placeholder, and the blank field is simply omitted from the generated
 * YAML, so the apply merge keeps the server's stored value.
 */
interface UseEntityEditConfigOptions<TField extends { key: string; kind?: string }> {
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
  /**
   * Password-kind fields that have a stored (server-side) value. The form
   * value is masked to '' for these (C-A4); the card uses the set to show
   * the "saved — leave blank to keep" placeholder instead of echoing the
   * secret.
   */
  secretSavedKeys: ReadonlySet<string>
  previewYaml: string
  applyYaml: string
  statusMsg: { type: 'success' | 'error'; text: string } | null
  /**
   * Hot-reload the apply YAML via PUT /configs. Resolves to whether the
   * reload succeeded so the caller's confirmation dialog (C-A1: detail
   * pages wrap this behind ConfigApplyConfirmationDialog) can stay open
   * on failure.
   */
  handleReload: () => Promise<boolean>
  /** Verbatim error of the last failed reload — surfaced inside the confirmation dialog. */
  reloadError: string | null
  isReloading: boolean
}

export function useEntityEditConfig<TField extends { key: string; kind?: string }>(
  options: UseEntityEditConfigOptions<TField>,
) {
  const { fields, prefillValues, buildPreviewYaml, buildApplyYaml, successKey, failureKey } =
    options

  const { t } = useTranslation()
  const updateConfig = useUpdateConfig()
  const addSnapshot = useConfigHistoryStore((s) => s.addSnapshot)
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
  // Last failed reload's message, kept separately so the confirmation dialog
  // can render it in place (applyError slot) while statusMsg feeds the card.
  const [reloadError, setReloadError] = useState<string | null>(null)
  // Password-kind keys that carry a stored value (C-A4 masking).
  const [secretSavedKeys, setSecretSavedKeys] = useState<ReadonlySet<string>>(() => new Set())

  // Pre-fill form from the existing server config.
  useEffect(() => {
    if (!rawYaml) return
    try {
      const cfg = parseConfigYaml(rawYaml)
      const filled = prefillValues(cfg)
      if (filled) {
        // C-A4: mask stored secrets — a non-empty password field value is
        // recorded as "saved" and replaced with '' so the secret never
        // reaches the form state (nor the preview/apply YAML).
        const saved = new Set<string>()
        for (const f of fields) {
          if (f.kind === 'password' && (filled[f.key] ?? '') !== '') {
            saved.add(f.key)
            filled[f.key] = ''
          }
        }
        setSecretSavedKeys(saved)
        setValues(filled)
      }
    } catch {
      // If YAML parse fails, leave the form empty — don't crash the page.
    }
  }, [rawYaml, prefillValues, fields])

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
    setReloadError(null)
    try {
      await updateConfig.mutateAsync({ payload: applyYaml })
      addSnapshot(applyYaml)
      setStatusMsg({ type: 'success', text: t(successKey) })
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      const text = msg || t(failureKey)
      setReloadError(text)
      setStatusMsg({ type: 'error', text })
      return false
    }
  }

  return {
    open,
    setOpen,
    values,
    setField,
    secretSavedKeys,
    previewYaml,
    applyYaml,
    statusMsg,
    handleReload,
    reloadError,
    isReloading: updateConfig.isPending,
  }
}
