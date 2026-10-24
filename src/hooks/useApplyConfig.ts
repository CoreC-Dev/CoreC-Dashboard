import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/client'
import { useUpdateConfig, useValidateConfig } from '@/api/hooks'
import { useConfigHistoryStore } from '@/stores/configHistoryStore'
import { isSeedBlocked, useConfigStore } from '@/stores/configStore'

/**
 * Shared apply-config dialog state for list/detail pages.
 *
 * One hook for the four near-identical ConfigApplyConfirmationDialog usages
 * in DriversPage, TransportsPage, RulesPage, and ConfigCenterPage.
 *
 * The hook manages dialog open/error state and the onConfirm handler
 * (server-validate → PUT → markSaved → close). The caller provides
 * page-specific functions and renders `<ConfigApplyConfirmationDialog
 * {...dialogProps} />`.
 *
 * Server-side validation (honesty fix): onConfirm
 * first dry-runs the working YAML through POST /configs/validate — the
 * ConfigApplyConfirmationDialog header claims "Path A validates
 * via POST /configs/validate first (if available)", so it must actually
 * do that: a { valid: false } response blocks the PUT with the server
 * message in the dialog; warnings (e.g. idle-mode hints) are appended to
 * the dialog's warning block; a 404/501 (endpoint unavailable on older
 * backends) skips the check and proceeds, exactly as "if available"
 * promises; any other transport error blocks the apply conservatively.
 *
 * OnConfirm also refuses to PUT while the server config has never
 * been loaded (auto-seed in flight or failed and no saved baseline) —
 * applying an unknown working config then could wipe the control plane.
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
  const validateConfig = useValidateConfig()
  const addSnapshot = useConfigHistoryStore((s) => s.addSnapshot)
  const [open, setOpen] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [serverValidating, setServerValidating] = useState(false)
  const [serverWarnings, setServerWarnings] = useState<string[] | null>(null)

  /** Open the dialog, clearing the previous error and warnings. */
  const openDialog = () => {
    setApplyError(null)
    setServerWarnings(null)
    setOpen(true)
  }

  const putYaml = (yaml: string) => {
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
  }

  const dialogProps = {
    open,
    onOpenChange: (v: boolean) => {
      setOpen(v)
      if (!v) setApplyError(null)
    },
    beforeYaml: getSavedYaml(),
    afterYaml: getWorkingYaml() ?? '',
    applying: serverValidating || updateConfig.isPending,
    validationErrors,
    validationWarnings: [...(validationWarnings ?? []), ...(serverWarnings ?? [])],
    applyError: applyError ?? undefined,
    onConfirm: () => {
      if (validationErrors) return
      // Never PUT while the server config is unknown (seed in flight
      // or failed, no baseline) — the apply could wipe the control plane.
      if (isSeedBlocked(useConfigStore.getState())) {
        setApplyError(t('configCenter.applyBlockedSeed'))
        return
      }
      const yaml = getWorkingYaml()
      if (!yaml) return
      setApplyError(null)
      // Server-side dry-run before the destructive PUT.
      setServerValidating(true)
      validateConfig.mutate(yaml, {
        onSuccess: (res) => {
          setServerValidating(false)
          if (!res.valid) {
            // Raw server message — the dialog's applyError block already
            // carries its own heading; keep the verdict verbatim.
            setApplyError(res.error || t('configCenter.serverValidateFailed', { error: '' }))
            return
          }
          setServerWarnings(res.warnings?.length ? res.warnings : null)
          putYaml(yaml)
        },
        onError: (err) => {
          setServerValidating(false)
          if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
            // Endpoint unavailable on older backends — "if available".
            putYaml(yaml)
            return
          }
          setApplyError(err instanceof Error ? err.message : String(err))
        },
      })
    },
  }

  return {
    open,
    setOpen,
    openDialog,
    applyError,
    setApplyError,
    dialogProps,
    isPending: serverValidating || updateConfig.isPending,
  }
}
