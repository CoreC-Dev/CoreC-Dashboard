import { useState } from 'react'
import { useUpdateConfig } from '@/api/hooks'

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
  /** Extra action on successful apply (e.g. invalidateQueries, refetch). */
  onApplySuccess?: () => void
}

export function useApplyConfig(options: UseApplyConfigOptions) {
  const { getWorkingYaml, getSavedYaml, markSaved, validationErrors, onApplySuccess } = options
  const updateConfig = useUpdateConfig()
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
    applyError: applyError ?? undefined,
    onConfirm: () => {
      if (validationErrors) return
      const yaml = getWorkingYaml()
      if (!yaml) return
      setApplyError(null)
      updateConfig.mutate(
        { payload: yaml },
        {
          onSuccess: () => {
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
