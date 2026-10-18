import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateConfig } from '@/api/hooks'
import { useConfigHistoryStore } from '@/stores/configHistoryStore'
import { isSeedBlocked, useConfigStore } from '@/stores/configStore'

/**
 * Shared apply-config dialog state for list/detail pages.
 *
 * Extracted from 4 near-identical ConfigApplyConfirmationDialog usages in
 * DriversPage, TransportsPage, RulesPage, and ConfigCenterPage (TD-DUP-003).
 *
 * The hook manages dialog open/error state and the onConfirm handler
 * (validate → get YAML → mutate → markSaved → close). The caller provides
 * page-specific functions and renders `<ConfigApplyConfirmationDialog
 * {...dialogProps} />`.
 *
 * D-16: onConfirm refuses to PUT while the server config has never been
 * loaded (auto-seed in flight or failed and no saved baseline) — applying
 * an unknown working config then could wipe the running control plane.
 * The rejection surfaces as an applyError inside the dialog.
 */
interface UseApplyConfigOptions {
  /** Get the current working YAML (null if no working config). */
  getWorkingYaml: () => string | null
  /** Get the saved YAML for diff display (null = new config). */
  getSavedYaml: () => string | null
  /** Mark the config as saved (clears dirty state). */
  markSaved: () => void
  /** Validation errors from formatValidationErrors (undefined = valid). */
  validationErrors: string[] | undefined
  /** Non-blocking validation warnings (idle-mode hints), undefined = none. */
  validationWarnings?: string[]
  /** Extra action on successful apply (e.g. invalidateQueries, refetch). */
  onApplySuccess?: () => void
}

export function useApplyConfig(options: UseApplyConfigOptions) {
  const {
    getWorkingYaml,
    getSavedYaml,
    markSaved,
    validationErrors,
    validationWarnings,
    onApplySuccess,
  } = options
  const { t } = useTranslation()
  const updateConfig = useUpdateConfig()
  const addSnapshot = useConfigHistoryStore((s) => s.addSnapshot)
  const [open, setOpen] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  /** Open the dialog, clearing the previous error. */
  const openDialog = () => {
    setApplyError(null)
    setOpen(true)
  }

  const dialogProps = {
    open,
    onOpenChange: (v: boolean) => {
      setOpen(v)
      if (!v) setApplyError(null)
    },
    beforeYaml: getSavedYaml(),
    afterYaml: getWorkingYaml() ?? '',
    applying: updateConfig.isPending,
    validationErrors,
    validationWarnings,
    applyError: applyError ?? undefined,
    onConfirm: () => {
      if (validationErrors) return
      // D-16: never PUT while the server config is unknown (seed in flight
      // or failed, no baseline) — the apply could wipe the control plane.
      if (isSeedBlocked(useConfigStore.getState())) {
        setApplyError(t('configCenter.applyBlockedSeed'))
        return
      }
      const yaml = getWorkingYaml()
      if (!yaml) return
      setApplyError(null)
      updateConfig.mutate(
        { payload: yaml },
        {
          onSuccess: () => {
            addSnapshot(yaml)
            markSaved()
            setOpen(false)
            onApplySuccess?.()
          },
          onError: (err) => setApplyError(err instanceof Error ? err.message : String(err)),
        },
      )
    },
  }

  return {
    open,
    setOpen,
    openDialog,
    applyError,
    setApplyError,
    dialogProps,
    isPending: updateConfig.isPending,
  }
}
