/**
 * State + handlers for the Config Center page — the page itself stays a
 * thin composition root. Owns the YAML editor content, form↔YAML bridge,
 * file upload/download, template loading, log-level patching, hot reload,
 * server load, dry-run validation, change history, and the debounced diff
 * preview.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw, useConfigs, usePatchConfig, useValidateConfig } from '@/api/hooks'
import { useApplyConfig } from '@/hooks/useApplyConfig'
import { useConfigCenterLoads } from '@/hooks/useConfigCenterLoads'
import { type ConfigSnapshot, useConfigHistory } from '@/hooks/useConfigHistory'
import {
  formatValidationErrors,
  formatValidationWarnings,
  useConfigValidation,
} from '@/hooks/useConfigValidation'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useStatusMessage } from '@/hooks/useStatusMessage'
import { useYamlApplyFlow } from '@/hooks/useYamlApplyFlow'
import { DEFAULT_SAMPLE_YAML } from '@/lib/configTemplates'
import { dumpConfigYaml, parseConfigYaml, yamlDiffersFromConfig } from '@/lib/configYaml'
import { computeLcsDiff, type DiffLine } from '@/lib/yamlDiff'
import { useConfigStore } from '@/stores/configStore'

const STATUS_AUTO_DISMISS_MS = 4500

export type ConfigMode = 'form' | 'yaml'

/** Persistent dry-run validation result. Rendered in a dedicated
 * non-dismissing block by the page; only a clean success uses the
 * auto-dismissing status strip. */
export type DryRunResult =
  | { outcome: 'valid-with-warnings'; warnings: string[] }
  | { outcome: 'invalid'; error: string }
  | { outcome: 'request-failed'; error: string }

export function useConfigCenter() {
  const { t } = useTranslation()
  const {
    data: configData,
    refetch,
    isLoading: isLoadingConfigs,
    isError,
    error,
    isFetching: isFetchingConfigs,
  } = useConfigs()
  const patchMutation = usePatchConfig()
  // updateMutation lives in useYamlApplyFlow (the YAML-mode PUT owner) and
  // is re-exported below for the page's pending-state props.
  // Path A — full config from GET /configs/raw + server-side dry-run.
  const rawConfigQuery = useConfigRaw()
  const validateMutation = useValidateConfig()

  // configStore integration for structured global config editing
  const configDirty = useConfigStore((s) => s.dirty)
  const getWorkingYaml = useConfigStore((s) => s.getWorkingYaml)
  const getSavedYaml = useConfigStore((s) => s.getSavedYaml)
  const markSaved = useConfigStore((s) => s.markSaved)
  const loadFromYaml = useConfigStore((s) => s.loadFromYaml)
  const applyGlobalPatch = useConfigStore((s) => s.applyGlobalPatch)
  const seedFromServer = useConfigStore((s) => s.seedFromServer)
  const revertConfig = useConfigStore((s) => s.revert)
  const configWorkingExists = useConfigStore((s) => !!s.workingConfig)
  // Auto-seed status for the failure banner and the Create/Apply
  // guards. Driven by useAutoLoadConfig (mounted in AppShell).
  const hasSavedBaseline = useConfigStore((s) => !!s.savedConfig)
  const seedStatus = useConfigStore((s) => s.seedStatus)
  const seedLoadFailed = !hasSavedBaseline && seedStatus === 'failed'
  // Pre-apply validation: run zod schema + cross-entity checks on the
  // working config. Errors are surfaced in the apply confirmation dialog
  // and block the apply button until resolved.
  const validation = useConfigValidation()
  const validationErrors = formatValidationErrors(validation)
  const validationWarnings = formatValidationWarnings(validation)
  const hasValidationErrors = validationErrors !== undefined

  const { openDialog: openApplyDialog, dialogProps: applyDialogProps } = useApplyConfig({
    getWorkingYaml,
    getSavedYaml,
    markSaved,
    validationErrors,
    validationWarnings,
    onApplySuccess: () => refetch(),
  })

  const [mode, setMode] = useState<ConfigMode>('form')
  const [yamlContent, setYamlContent] = useState(DEFAULT_SAMPLE_YAML)
  // Debounced copy of the editor content used only for the diff preview and
  // the unsaved-changes guard, so the O(m×n) computations run at most ~3×/sec
  // while typing instead of on every keystroke. The editor stays un-debounced.
  const debouncedYaml = useDebouncedValue(yamlContent, 300)
  const [currentLogLevel, setCurrentLogLevel] = useState<string>('info')
  const { statusMsg, setStatusMsg } = useStatusMessage(STATUS_AUTO_DISMISS_MS)
  // Change-history state: snapshots persisted to localStorage after every
  // successful PUT /configs.
  const { history } = useConfigHistory()
  const [diffOpen, setDiffOpen] = useState(true)
  // Guards one-time auto-load of the live server config into the editor on
  // first successful fetch, so operators see the actual running config
  // instead of DEFAULT_SAMPLE_YAML without a manual "Load from Server" click.
  const [autoLoaded, setAutoLoaded] = useState(false)
  // Persistent dry-run validation result. Unlike statusMsg it does NOT
  // auto-dismiss: server-side warnings/errors must stay readable instead of
  // vanishing with the 4.5s status strip.
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)
  // Every editor content change (user keystroke or programmatic load) goes
  // through this wrapper so a stale validation result never outlives its
  // YAML. Exposed to the page as `setYamlContent`.
  const applyYamlContent = useCallback((text: string) => {
    setYamlContent(text)
    setDryRunResult(null)
  }, [])

  // YAML-mode apply flow: apply dialog + form↔YAML divergence bridge/guard +
  // seed guard. Lives in useYamlApplyFlow (file-size limit); the
  // page consumes it through this hook's return value unchanged.
  const {
    updateMutation,
    yamlApplying,
    yamlApplyOpen,
    setYamlApplyOpen,
    yamlApplyError,
    yamlApplyWarnings,
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
  } = useYamlApplyFlow({
    yamlContent,
    setYamlContent: applyYamlContent,
    mode,
    setMode,
    loadFromYaml,
    getWorkingYaml,
    setStatusMsg,
    onApplied: () => {
      refetch()
    },
  })

  // ── Unsaved-changes guard ───────────────────────────────────
  // The editor counts as dirty when it differs from the SERVER config
  // (semantically — parse both sides). Together with the form side's dirty
  // flag this drives the beforeunload guard; in-app route blocking would
  // need a data-router migration (createHashRouter), so under the current
  // <HashRouter> the audit's useBeforeUnload approach applies.
  const serverRawYaml = rawConfigQuery.data
  const editorDirty = useMemo(() => {
    if (!serverRawYaml?.trim()) return false
    try {
      return yamlDiffersFromConfig(debouncedYaml, parseConfigYaml(serverRawYaml))
    } catch {
      // Server YAML our parser rejects: treat the editor as diverged
      // rather than silently dropping the guard.
      return true
    }
  }, [debouncedYaml, serverRawYaml])
  const hasPendingEdits = () => configDirty || editorDirty
  // Template/file loading with the discard confirmation; extracted to
  // useConfigCenterLoads (God-file limit).
  const {
    templatePickerOpen,
    setTemplatePickerOpen,
    handleFileUpload,
    handleLoadTemplate,
    loadConfirmOpen,
    confirmPendingLoad,
    cancelPendingLoad,
  } = useConfigCenterLoads({
    applyYamlContent,
    loadFromYaml,
    setStatusMsg,
    hasPendingEdits,
  })
  // beforeunload guard (the audit's useBeforeUnload approach; the
  // react-router hook registers unconditionally, so this is the same
  // listener mechanism with an explicit activation flag).
  const guardActive = configDirty || editorDirty
  useEffect(() => {
    if (!guardActive) return
    const handler = (event: BeforeUnloadEvent) => {
      // Browsers show their own native prompt; the handler just vetoes.
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler, { capture: true })
    return () => window.removeEventListener('beforeunload', handler, { capture: true })
  }, [guardActive])

  // Auto-load the live server config into the editor on first successful
  // fetch. Without this the editor shows DEFAULT_SAMPLE_YAML and the operator
  // must manually click "Load from Server" to see the actual running config —
  // a confusing UX, especially when they then "Hot Reload" and would push the
  // stale sample YAML back to the server. The autoLoaded guard ensures we
  // only auto-populate once (on mount), not on every refetch, so subsequent
  // manual edits are not clobbered by background revalidations.
  useEffect(() => {
    if (autoLoaded) return
    const yamlText = rawConfigQuery.data
    if (!yamlText?.trim()) return
    setAutoLoaded(true)
    applyYamlContent(yamlText)
    seedFromServer(yamlText)
    // applyYamlContent is a setState-only useCallback (stable identity);
    // the one-shot autoLoaded guard keeps this effect from re-firing.
  }, [rawConfigQuery.data, seedFromServer, autoLoaded, applyYamlContent])

  // ── YAML ↔ Form bridge ─────────────────────────────────────────────
  // "Import YAML → Form": parse the current Monaco editor content into the
  // configStore so the structured editors (Global/Node/Drivers/etc.) reflect
  // the YAML the user has been editing in code view.
  const handleImportYamlToForm = () => {
    const err = loadFromYaml(yamlContent)
    if (err) {
      setStatusMsg({ type: 'error', text: t('config.importYamlFailed', { error: err }) })
    } else {
      setStatusMsg({ type: 'success', text: t('config.importYamlSuccess') })
      setMode('form')
    }
  }

  // "Sync Form → YAML": dump the configStore working config back into the
  // Monaco editor so the user can review or further edit the structured
  // changes as raw YAML.
  const handleSyncFormToYaml = () => {
    const yaml = getWorkingYaml()
    if (yaml) {
      applyYamlContent(yaml)
      setStatusMsg({ type: 'success', text: t('config.syncFormSuccess') })
      setMode('yaml')
    } else {
      setStatusMsg({ type: 'error', text: t('config.syncFormEmpty') })
    }
  }

  // "Download YAML file": export the current working config as a .yaml file.
  // Exports the working (unsaved) YAML so the user can back up their in-progress
  // edits. If working YAML is empty, falls back to saved YAML.
  const handleFileDownload = () => {
    const yaml = getWorkingYaml() ?? getSavedYaml() ?? ''
    if (!yaml.trim()) {
      setStatusMsg({ type: 'error', text: t('config.exportEmpty') })
      return
    }
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
    a.download = `corec-config-${ts}.yaml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStatusMsg({ type: 'success', text: t('config.exported') })
  }

  // Sync the displayed log level from the server-side config overview once it
  // loads (or whenever it changes after a PATCH/PUT).
  useEffect(() => {
    const serverLevel = configData?.global?.['log-level']
    if (serverLevel) setCurrentLogLevel(serverLevel)
  }, [configData])

  const handleLogLevelChange = async (lvl: string) => {
    const prev = currentLogLevel
    // Optimistic update for snappy UI; reverted on failure.
    setCurrentLogLevel(lvl)
    setStatusMsg(null)
    try {
      // The server only supports `log-level` for PATCH /configs.
      await patchMutation.mutateAsync({ 'log-level': lvl })
      // Record the patch in the store baseline (saved + mirrored
      // working value) but leave the editor content untouched: the old flow
      // overwrote yamlContent with the refetched server config, silently
      // destroying unsaved editor edits. If the editor content is now
      // stale, the apply dialog's diff (baseline = saved config) shows the
      // log-level reversion explicitly instead of sneaking it into the PUT.
      applyGlobalPatch('log-level', lvl)
      void refetch()
      setStatusMsg({ type: 'success', text: t('config.logLevelUpdated', { level: lvl }) })
    } catch (err: unknown) {
      setCurrentLogLevel(prev)
      const msg = err instanceof Error ? err.message : t('config.logLevelUpdateFailed')
      setStatusMsg({ type: 'error', text: msg || t('config.logLevelUpdateFailed') })
    }
  }

  // Path A — "Load from Server": fetch the live server config (GET
  // /configs/raw, plaintext per the backend contract) into both the YAML
  // editor and the configStore so the operator edits the REAL configuration.
  const handleLoadFromServer = () => {
    setStatusMsg(null)
    // Trigger a fresh fetch (refetch ignores stale cache so the editor shows
    // the current state, not a cached copy from before a PUT).
    void rawConfigQuery
      .refetch()
      .then((res) => {
        const yamlText = res.data
        if (!yamlText?.trim()) {
          setStatusMsg({ type: 'error', text: t('config.loadFromServerEmpty') })
          return
        }
        applyYamlContent(yamlText)
        const err = loadFromYaml(yamlText)
        if (err) {
          setStatusMsg({ type: 'error', text: t('config.importYamlFailed', { error: err }) })
        } else {
          setStatusMsg({ type: 'success', text: t('config.loadFromServerSuccess') })
          setMode('yaml')
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setStatusMsg({ type: 'error', text: t('config.loadFromServerFailed', { error: msg }) })
      })
  }

  // Path A — "Validate": dry-run the current editor config on the server via
  // POST /configs/validate (parse + config validation, NO apply). Surfaces
  // whether the config would be accepted before the operator commits a PUT.
  // Results with warnings/errors go to the persistent dryRunResult
  // block instead of the 4.5s status strip; ONLY a clean success auto-dismisses.
  const handleDryRunValidate = async () => {
    setStatusMsg(null)
    try {
      const result = await validateMutation.mutateAsync(yamlContent)
      if (result.valid) {
        const warnings = result.warnings ?? []
        if (warnings.length > 0) {
          setDryRunResult({ outcome: 'valid-with-warnings', warnings })
        } else {
          setDryRunResult(null)
          setStatusMsg({ type: 'success', text: t('config.dryRunValid') })
        }
      } else {
        setDryRunResult({ outcome: 'invalid', error: result.error ?? '' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setDryRunResult({ outcome: 'request-failed', error: msg })
    }
  }

  // Restore a history snapshot into the YAML editor and switch to code view.
  const handleRestore = (snap: ConfigSnapshot) => {
    applyYamlContent(snap.yaml)
    setMode('yaml')
    setStatusMsg({ type: 'success', text: t('config.historyLoadedIntoEditor') })
  }

  // Revert the configStore working config to the last saved state.
  const revertWorkingConfig = () => revertConfig()

  // Retry the failed server-config seed (banner "Retry" button).
  const retrySeed = () => {
    void rawConfigQuery.refetch()
  }

  // Line-by-line diff between the editor content and the SAVED SERVER CONFIG
  // (the old per-session "last submitted" baseline was null on first
  // visit, hiding the preview, and produced phantom diffs after "Load from
  // Server"). Hidden until a baseline exists. Uses the debounced value so the
  // O(m×n) LCS isn't recomputed on every keystroke; hasDiffChanges is folded
  // in so the O(n) scan only runs when the inputs change.
  const savedConfig = useConfigStore((s) => s.savedConfig)
  const diffBaselineYaml = useMemo(
    () => (savedConfig ? dumpConfigYaml(savedConfig) : null),
    [savedConfig],
  )
  const { diffLines, hasDiffChanges } = useMemo<{
    diffLines: DiffLine[]
    hasDiffChanges: boolean
  }>(() => {
    if (diffBaselineYaml === null) return { diffLines: [], hasDiffChanges: false }
    const lines = computeLcsDiff(diffBaselineYaml, debouncedYaml)
    return { diffLines: lines, hasDiffChanges: lines.some((line) => line.type !== 'equal') }
  }, [diffBaselineYaml, debouncedYaml])

  return {
    // queries / mutations
    configData,
    isLoadingConfigs,
    isError,
    error,
    isFetchingConfigs,
    refetch,
    rawConfigQuery,
    validateMutation,
    updateMutation,
    patchMutation,
    // configStore + apply dialog
    configDirty,
    configWorkingExists,
    hasValidationErrors,
    applyDialogProps,
    openApplyDialog,
    revertWorkingConfig,
    getSavedYaml,
    // seed-failure banner state
    seedLoadFailed,
    seedStatus,
    retrySeed,
    // state
    mode,
    setMode,
    yamlContent,
    setYamlContent: applyYamlContent,
    currentLogLevel,
    statusMsg,
    diffBaselineYaml,
    diffOpen,
    setDiffOpen,
    history,
    // diff
    diffLines,
    hasDiffChanges,
    // persistent dry-run validation result (null = none)
    dryRunResult,
    // template/file loads (useConfigCenterLoads)
    templatePickerOpen,
    setTemplatePickerOpen,
    loadConfirmOpen,
    confirmPendingLoad,
    cancelPendingLoad,
    // handlers
    handleImportYamlToForm,
    handleSyncFormToYaml,
    handleFileUpload,
    handleFileDownload,
    handleLoadTemplate,
    handleLogLevelChange,
    handleHotReload,
    handleLoadFromServer,
    handleDryRunValidate,
    handleRestore,
    // form↔YAML divergence bridge + hot-reload guard
    requestModeSwitch,
    bridgeTarget,
    bridgeImport,
    bridgeOverwrite,
    bridgeCancel,
    applyGuardOpen,
    applyGuardProceed,
    applyGuardCancel,
    // YAML-mode apply dialog (yamlApplying covers the server dry-run too)
    yamlApplying,
    yamlApplyOpen,
    setYamlApplyOpen,
    yamlApplyError,
    yamlApplyWarnings,
    handleYamlApplyConfirm,
  }
}
