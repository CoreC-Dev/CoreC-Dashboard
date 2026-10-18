/**
 * State + handlers for the Config Center page.
 *
 * Extracted from ConfigCenterPage.tsx (TD-CPLX-001) so the page becomes a thin
 * composition root. Owns the YAML editor content, form↔YAML bridge, file
 * upload/download, template loading, log-level patching, hot reload, server
 * load, dry-run validation, change history, and the debounced diff preview.
 * No behavior changes — pure relocation of the page's stateful logic.
 */
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw, useConfigs, usePatchConfig, useValidateConfig } from '@/api/hooks'
import { useApplyConfig } from '@/hooks/useApplyConfig'
import { type ConfigSnapshot, useConfigHistory } from '@/hooks/useConfigHistory'
import {
  formatValidationErrors,
  formatValidationWarnings,
  useConfigValidation,
} from '@/hooks/useConfigValidation'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useStatusMessage } from '@/hooks/useStatusMessage'
import { useYamlApplyFlow } from '@/hooks/useYamlApplyFlow'
import { type ConfigTemplate, DEFAULT_SAMPLE_YAML } from '@/lib/configTemplates'
import { generateRandomSecret } from '@/lib/utils'
import { computeLcsDiff, type DiffLine } from '@/lib/yamlDiff'
import { useConfigStore } from '@/stores/configStore'

const STATUS_AUTO_DISMISS_MS = 4500

export type ConfigMode = 'form' | 'yaml'

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
  const seedFromServer = useConfigStore((s) => s.seedFromServer)
  const revertConfig = useConfigStore((s) => s.revert)
  const configWorkingExists = useConfigStore((s) => !!s.workingConfig)
  // D-16 — auto-seed status for the failure banner and the Create/Apply
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
  // Debounced copy of the editor content used only for the diff preview, so
  // the O(m×n) LCS in computeDiff runs at most ~3×/sec while typing instead
  // of on every keystroke. The editor itself stays un-debounced.
  const debouncedYaml = useDebouncedValue(yamlContent, 300)
  const [currentLogLevel, setCurrentLogLevel] = useState<string>('info')
  const { statusMsg, setStatusMsg } = useStatusMessage(STATUS_AUTO_DISMISS_MS)
  // Change-history state: snapshots persisted to localStorage after every
  // successful PUT /configs, plus the last submitted YAML for the diff preview.
  const { history } = useConfigHistory()
  const [lastSubmittedYaml, setLastSubmittedYaml] = useState<string | null>(null)
  const [diffOpen, setDiffOpen] = useState(true)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  // Guards one-time auto-load of the live server config into the editor on
  // first successful fetch, so operators see the actual running config
  // instead of DEFAULT_SAMPLE_YAML without a manual "Load from Server" click.
  const [autoLoaded, setAutoLoaded] = useState(false)

  // YAML-mode apply flow: apply dialog + C-D1 divergence bridge/guard +
  // D-16 seed guard. Extracted to useYamlApplyFlow (God-file limit); the
  // page consumes it through this hook's return value unchanged.
  const {
    updateMutation,
    yamlApplyOpen,
    setYamlApplyOpen,
    yamlApplyError,
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
    setYamlContent,
    mode,
    setMode,
    loadFromYaml,
    getWorkingYaml,
    setStatusMsg,
    onApplied: (appliedYaml) => {
      setLastSubmittedYaml(appliedYaml)
      refetch()
    },
  })

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
    setYamlContent(yamlText)
    seedFromServer(yamlText)
  }, [rawConfigQuery.data, seedFromServer, autoLoaded])

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
      setYamlContent(yaml)
      setStatusMsg({ type: 'success', text: t('config.syncFormSuccess') })
      setMode('yaml')
    } else {
      setStatusMsg({ type: 'error', text: t('config.syncFormEmpty') })
    }
  }

  // "Upload YAML file": read a user-selected .yaml/.yml file into both the
  // Monaco editor and the configStore.
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result)
      setYamlContent(text)
      const err = loadFromYaml(text)
      if (err) {
        setStatusMsg({
          type: 'error',
          text: t('config.importYamlFailed', { error: err }),
        })
      } else {
        setStatusMsg({
          type: 'success',
          text: t('config.fileLoaded', { name: file.name }),
        })
      }
    }
    reader.onerror = () => setStatusMsg({ type: 'error', text: t('config.fileLoadFailed') })
    reader.readAsText(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
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

  // Load a pre-built configuration template into the working config.
  // Replaces the weak placeholder secret with a random one (TD-SEC-006, D5).
  const handleLoadTemplate = (template: ConfigTemplate) => {
    const yamlWithSecret = template.yaml.replace('change-me-please', generateRandomSecret())
    setYamlContent(yamlWithSecret)
    const err = loadFromYaml(yamlWithSecret)
    if (err) {
      setStatusMsg({ type: 'error', text: t('config.importYamlFailed', { error: err }) })
    } else {
      setStatusMsg({
        type: 'success',
        text: t('config.templateLoaded', { name: template.name }),
      })
    }
    setTemplatePickerOpen(false)
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
      // After a successful PATCH, the active config changed. The M-1 cache
      // fix invalidates ['configsRaw'], but the Monaco editor binds to
      // yamlContent state (not the cache directly), so we must also re-sync
      // yamlContent from the refetched raw config — otherwise a subsequent
      // "Hot Reload" would PUT the stale yamlContent and overwrite the patch.
      void rawConfigQuery.refetch().then((res) => {
        if (res.data?.trim()) {
          setYamlContent(res.data)
          loadFromYaml(res.data)
        }
      })
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
        setYamlContent(yamlText)
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
  const handleDryRunValidate = async () => {
    setStatusMsg(null)
    try {
      const result = await validateMutation.mutateAsync(yamlContent)
      if (result.valid) {
        const warnings = result.warnings
        if (warnings && warnings.length > 0) {
          setStatusMsg({
            type: 'success',
            text: `${t('config.dryRunValid')} — ${t('config.validationWarningsTitle')}: ${warnings.join('; ')}`,
          })
        } else {
          setStatusMsg({ type: 'success', text: t('config.dryRunValid') })
        }
      } else {
        setStatusMsg({
          type: 'error',
          text: t('config.dryRunInvalid', { error: result.error ?? '' }),
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatusMsg({ type: 'error', text: t('config.dryRunFailed', { error: msg }) })
    }
  }

  // Restore a history snapshot into the YAML editor and switch to code view.
  const handleRestore = (snap: ConfigSnapshot) => {
    setYamlContent(snap.yaml)
    setMode('yaml')
    setStatusMsg({ type: 'success', text: t('config.restored') })
  }

  // Revert the configStore working config to the last saved state.
  const revertWorkingConfig = () => revertConfig()

  // D-16 — retry the failed server-config seed (banner "Retry" button).
  const retrySeed = () => {
    void rawConfigQuery.refetch()
  }

  // Line-by-line diff between the editor content and the last submitted YAML.
  // Uses the debounced value so the O(m×n) LCS isn't recomputed on every
  // keystroke. hasDiffChanges is folded in here too, so the O(n) scan only
  // runs when the diff inputs actually change rather than on every render.
  // Empty when no prior submission exists, in which case the preview is skipped.
  const { diffLines, hasDiffChanges } = useMemo<{
    diffLines: DiffLine[]
    hasDiffChanges: boolean
  }>(() => {
    if (lastSubmittedYaml === null) return { diffLines: [], hasDiffChanges: false }
    const lines = computeLcsDiff(lastSubmittedYaml, debouncedYaml)
    return { diffLines: lines, hasDiffChanges: lines.some((line) => line.type !== 'equal') }
  }, [lastSubmittedYaml, debouncedYaml])

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
    // D-16 seed-failure banner state
    seedLoadFailed,
    seedStatus,
    retrySeed,
    // state
    mode,
    setMode,
    yamlContent,
    setYamlContent,
    currentLogLevel,
    statusMsg,
    lastSubmittedYaml,
    diffOpen,
    setDiffOpen,
    templatePickerOpen,
    setTemplatePickerOpen,
    history,
    // diff
    diffLines,
    hasDiffChanges,
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
    // C-D1 form↔YAML divergence bridge + hot-reload guard
    requestModeSwitch,
    bridgeTarget,
    bridgeImport,
    bridgeOverwrite,
    bridgeCancel,
    applyGuardOpen,
    applyGuardProceed,
    applyGuardCancel,
    // YAML-mode apply dialog
    yamlApplyOpen,
    setYamlApplyOpen,
    yamlApplyError,
    handleYamlApplyConfirm,
  }
}
