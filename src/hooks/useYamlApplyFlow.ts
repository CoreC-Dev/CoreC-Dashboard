/**
 * YAML-mode apply flow for the Config Center.
 *
 * Owns everything specific to applying the RAW YAML editor content:
 * - the YAML-mode apply confirmation dialog state (open/error),
 * - the hot-reload acknowledgement guard: when the editor content
 * does not include the form side's unapplied edits, the operator must
 * explicitly acknowledge that those edits are NOT part of this apply,
 * - the mode-switch bridge: switching Form/YAML views with diverged
 * content asks which side to keep,
 * - the confirmed apply itself: PUT /configs → snapshot → record the
 * APPLIED YAML as the saved baseline (markSavedFromYaml); divergent
 * form edits stay pending,
 * - the seed guard: no PUT while the server config is unknown.
 *
 * The caller (useConfigCenter) keeps owning yamlContent/mode state and
 * passes accessors in; the page consumes everything through
 * useConfigCenter's return value.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/client'
import { useUpdateConfig, useValidateConfig } from '@/api/hooks'
import type { ConfigMode } from '@/hooks/useConfigCenter'
import type { StatusMessage } from '@/hooks/useStatusMessage'
import { yamlDiffersFromConfig } from '@/lib/configYaml'
import { useConfigHistoryStore } from '@/stores/configHistoryStore'
import { isSeedBlocked, useConfigStore } from '@/stores/configStore'

interface YamlApplyFlowOptions {
  /** Current Monaco editor content (the YAML that would be PUT). */
  yamlContent: string
  /** Setter for the editor content (used by the bridge "keep form" choice). */
  setYamlContent: (yaml: string) => void
  /** Current editing mode. */
  mode: ConfigMode
  /** Raw mode setter (bridge switches only after the user picked a side). */
  setMode: (mode: ConfigMode) => void
  /** Parse YAML into the configStore form side (bridge "keep YAML"). */
  loadFromYaml: (yaml: string) => string | null
  /** Dump the configStore working config to YAML (bridge "keep form"). */
  getWorkingYaml: () => string | null
  /** Transient status strip setter, shared with the caller. */
  setStatusMsg: (msg: StatusMessage) => void
  /** Called with the applied YAML after a successful apply (caller refetches
   *  the overview and re-anchors its diff preview baseline). */
  onApplied: (appliedYaml: string) => void
}

export function useYamlApplyFlow(options: YamlApplyFlowOptions) {
  const { yamlContent, setYamlContent, mode, setMode, loadFromYaml, getWorkingYaml } = options
  const { t } = useTranslation()
  const updateMutation = useUpdateConfig()
  const validateConfig = useValidateConfig()
  const addSnapshot = useConfigHistoryStore((s) => s.addSnapshot)
  const markSavedFromYaml = useConfigStore((s) => s.markSavedFromYaml)

  const [yamlApplyOpen, setYamlApplyOpen] = useState(false)
  const [yamlApplyError, setYamlApplyError] = useState<string | null>(null)
  // Server dry-run state: validating flag + warnings to surface in the
  // apply dialog alongside the local zod warnings.
  const [serverValidating, setServerValidating] = useState(false)
  const [yamlApplyWarnings, setYamlApplyWarnings] = useState<string[] | null>(null)
  // `bridgeTarget` holds the mode the user tried to switch to while form and
  // YAML had diverged (3-way dialog: import / overwrite / cancel).
  // `applyGuardOpen` gates hot reload when the editor content does not
  // include the form side's unapplied edits.
  const [bridgeTarget, setBridgeTarget] = useState<ConfigMode | null>(null)
  const [applyGuardOpen, setApplyGuardOpen] = useState(false)

  // The form view edits configStore.workingConfig; the YAML view edits the
  // raw `yamlContent` string — two manually bridged states. Evaluated on
  // demand (mode switch / hot reload click), never per keystroke.
  const yamlDiffersFromForm = (): boolean =>
    yamlDiffersFromConfig(yamlContent, useConfigStore.getState().workingConfig)

  // ModeSwitcher entry point. Switching views with diverged content
  // asks the user to pick a side.
  const requestModeSwitch = (next: ConfigMode) => {
    if (next === mode) return
    if (yamlDiffersFromForm()) setBridgeTarget(next)
    else setMode(next)
  }

  // Bridge choice: keep the YAML — parse the editor text into the form side
  // (semantics of the manual "Import YAML → Form" button), then switch.
  const bridgeImport = () => {
    const target = bridgeTarget
    setBridgeTarget(null)
    const err = loadFromYaml(yamlContent)
    if (err) {
      options.setStatusMsg({ type: 'error', text: t('config.importYamlFailed', { error: err }) })
      return
    }
    options.setStatusMsg({ type: 'success', text: t('config.importYamlSuccess') })
    if (target) setMode(target)
  }

  // Bridge choice: keep the form — dump the working config into the editor
  // (semantics of the manual "View as YAML" button), then switch.
  const bridgeOverwrite = () => {
    const target = bridgeTarget
    setBridgeTarget(null)
    const yaml = getWorkingYaml()
    if (!yaml) {
      options.setStatusMsg({ type: 'error', text: t('config.syncFormEmpty') })
      return
    }
    setYamlContent(yaml)
    if (target) setMode(target)
  }

  const bridgeCancel = () => setBridgeTarget(null)

  const handleHotReload = () => {
    setYamlApplyError(null)
    // Never offer the hot-reload path while the server config is
    // unknown: the PUT would replace a config we could never show a diff
    // for (the editor would still hold DEFAULT_SAMPLE_YAML).
    if (isSeedBlocked(useConfigStore.getState())) {
      options.setStatusMsg({ type: 'error', text: t('configCenter.applyBlockedSeed') })
      return
    }
    // When the editor content does not include the form side's
    // unapplied edits, gate the apply behind an explicit acknowledgement.
    if (yamlDiffersFromForm()) {
      setApplyGuardOpen(true)
      return
    }
    setYamlApplyOpen(true)
  }

  const applyGuardProceed = () => {
    setApplyGuardOpen(false)
    setYamlApplyOpen(true)
  }

  const applyGuardCancel = () => setApplyGuardOpen(false)

  const handleYamlApplyConfirm = async () => {
    // Belt-and-braces: the entry guard above should have blocked this
    // path already, but the confirm handler must never PUT against an
    // unknown server config either.
    if (isSeedBlocked(useConfigStore.getState())) {
      setYamlApplyError(t('configCenter.applyBlockedSeed'))
      return
    }
    options.setStatusMsg(null)
    setYamlApplyError(null)
    // Server-side dry-run before the destructive PUT:
    // { valid: false } blocks the PUT with the server message; warnings
    // surface in the dialog; 404/501 (endpoint unavailable) proceeds,
    // and any other transport error blocks.
    setServerValidating(true)
    try {
      const res = await validateConfig.mutateAsync(yamlContent)
      if (!res.valid) {
        setYamlApplyError(res.error || t('configCenter.serverValidateFailed', { error: '' }))
        return
      }
      setYamlApplyWarnings(res.warnings?.length ? res.warnings : null)
    } catch (err: unknown) {
      if (!(err instanceof ApiError && (err.status === 404 || err.status === 501))) {
        const msg = err instanceof Error ? err.message : String(err)
        setYamlApplyError(msg || t('config.dryRunFailed', { error: msg }))
        return
      }
    } finally {
      setServerValidating(false)
    }
    try {
      await updateMutation.mutateAsync({ payload: yamlContent })
      addSnapshot(yamlContent)
      setYamlApplyOpen(false)
      // Record what the SERVER actually accepted as the saved baseline.
      // Divergent edits stay pending (dirty).
      const syncErr = markSavedFromYaml(yamlContent)
      if (syncErr) {
        options.setStatusMsg({
          type: 'error',
          text: t('configCenter.applySyncFailed', { error: syncErr }),
        })
      } else {
        options.setStatusMsg({ type: 'success', text: t('config.reloadSuccess') })
      }
      options.onApplied(yamlContent)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.reloadFailed')
      setYamlApplyError(msg || t('config.reloadFailed'))
    }
  }

  return {
    updateMutation,
    // True while the server dry-run or the PUT itself is in flight — the
    // page passes this to the dialog's `applying` prop.
    yamlApplying: serverValidating || updateMutation.isPending,
    yamlApplyOpen,
    setYamlApplyOpen,
    yamlApplyError,
    yamlApplyWarnings: yamlApplyWarnings ?? undefined,
    handleYamlApplyConfirm,
    requestModeSwitch,
    bridgeTarget,
    bridgeImport,
    bridgeOverwrite,
    bridgeCancel,
    applyGuardOpen,
    applyGuardProceed,
    applyGuardCancel,
    handleHotReload,
  }
}
