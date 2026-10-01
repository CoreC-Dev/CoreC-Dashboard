import Editor from '@monaco-editor/react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Code2,
  Cpu,
  Download,
  FileText,
  Flame,
  FlaskConical,
  GitCompare,
  History,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  Network,
  RotateCcw,
  Sliders,
  Upload,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useConfigRaw,
  useConfigs,
  usePatchConfig,
  useUpdateConfig,
  useValidateConfig,
} from '@/api/hooks'
import { EventLogTerminal } from '@/components/admin/EventLogTerminal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { GlobalConfigEditor } from '@/features/admin/GlobalConfigEditor'
import { NodeConfigEditor } from '@/features/admin/NodeConfigEditor'
import { RuleGroupEditor } from '@/features/admin/RuleGroupEditor'
import { RuleProviderEditor } from '@/features/admin/RuleProviderEditor'
import { type ConfigSnapshot, useConfigHistory } from '@/hooks/useConfigHistory'
import { useConfigValidation } from '@/hooks/useConfigValidation'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useStatusMessage } from '@/hooks/useStatusMessage'
import { CONFIG_TEMPLATES, type ConfigTemplate } from '@/lib/configTemplates'
import { computeLcsDiff, type DiffLine } from '@/lib/yamlDiff'
import { useConfigStore } from '@/stores/configStore'
import { useThemeStore } from '@/stores/themeStore'
import { LOG_LEVELS } from '@/types/config'

const DEFAULT_SAMPLE_YAML = `# CoreC Gateway Configuration
global:
  log-level: info
  log-format: text
  api:
    listen: 0.0.0.0:9090
    rate-limit-per-sec: 100
  engine:
    data-bus-size: 8192
    workers: 0
    stale-threshold: 30s
    write-retry-count: 3
    command-concurrency: 16

drivers:
  - name: plc-modbus
    type: modbus-tcp
    settings:
      host: 192.168.1.100
      port: 502
      slave-id: 1
      timeout: 3s
    tags:
      - name: temperature
        address: "40001"
        type: float32
        group: sensors
        interval: 1s

transports:
  - name: cloud-mqtt
    type: mqtt
    batch-size: 50
    flush-interval: 1s
    settings:
      broker: tcp://broker.emqx.io:1883
      topic-template: "factory/{{.Driver}}/{{.Tag}}"

rules:
  - name: default-forward
    match: "ALL"
    action: forward
    target: cloud-mqtt
    priority: 100
`

const STATUS_AUTO_DISMISS_MS = 2500

// Line-by-line diff via longest-common-subsequence backtracking. Produces a
// flat list of equal / added / removed lines the UI can render directly; a
// changed line surfaces as a removed line followed by the added one.
// (Implementation lives in @/lib/yamlDiff — shared with ConfigApplyConfirmationDialog.)

interface ComponentEntry {
  name: string
  type: string
  action?: string
  priority?: number
}

const ComponentList: React.FC<{
  title: string
  icon: React.ReactNode
  entries: ComponentEntry[]
  typeLabel: string
  emptyText: string
}> = ({ title, icon, entries, typeLabel, emptyText }) => (
  <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
    <div className="px-3 py-2 border-b border-border/50 bg-muted/40 flex items-center space-x-1.5">
      {icon}
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title} · {entries.length}
      </span>
    </div>
    <div className="max-h-56 overflow-y-auto divide-y divide-border/40">
      {entries.length === 0 ? (
        <div className="px-3 py-4 text-[11px] text-muted-foreground">{emptyText}</div>
      ) : (
        entries.map((e) => (
          <div
            key={`${title}-${e.name}`}
            className="px-3 py-2 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{e.name}</div>
              <div className="text-[10px] font-mono text-muted-foreground truncate">
                {typeLabel}: {e.type}
              </div>
            </div>
            <div className="flex items-center space-x-1.5 shrink-0">
              {e.action && (
                <Badge variant="outline" className="text-[10px]">
                  {e.action}
                </Badge>
              )}
              {typeof e.priority === 'number' && (
                <span className="text-[10px] font-mono text-muted-foreground">#{e.priority}</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)

export const ConfigCenterPage: React.FC = () => {
  const { resolvedTheme } = useThemeStore()
  const { t } = useTranslation()
  const { data: configData, refetch, isLoading: isLoadingConfigs } = useConfigs()
  const patchMutation = usePatchConfig()
  const updateMutation = useUpdateConfig()
  // Path A — full redacted config from GET /configs/raw + server-side dry-run.
  const rawConfigQuery = useConfigRaw()
  const validateMutation = useValidateConfig()

  // configStore integration for structured global config editing
  const configDirty = useConfigStore((s) => s.dirty)
  const getWorkingYaml = useConfigStore((s) => s.getWorkingYaml)
  const getSavedYaml = useConfigStore((s) => s.getSavedYaml)
  const markSaved = useConfigStore((s) => s.markSaved)
  const loadFromYaml = useConfigStore((s) => s.loadFromYaml)
  const configWorkingExists = useConfigStore((s) => !!s.workingConfig)
  // Pre-apply validation: run zod schema + cross-entity checks on the
  // working config. Errors are surfaced in the apply confirmation dialog
  // and block the apply button until resolved.
  const validation = useConfigValidation()
  const validationErrorStrings = useMemo(
    () => validation.errors.map((e) => `${e.path}: ${e.message}`),
    [validation.errors],
  )
  const hasValidationErrors = validation.hasConfig && !validation.valid
  const [globalApplyOpen, setGlobalApplyOpen] = useState(false)

  const [mode, setMode] = useState<'form' | 'yaml'>('form')
  const [yamlContent, setYamlContent] = useState(DEFAULT_SAMPLE_YAML)
  // Debounced copy of the editor content used only for the diff preview, so
  // the O(m×n) LCS in computeDiff runs at most ~3×/sec while typing instead
  // of on every keystroke. The editor itself stays un-debounced.
  const debouncedYaml = useDebouncedValue(yamlContent, 300)
  const [currentLogLevel, setCurrentLogLevel] = useState<string>('info')
  const { statusMsg, setStatusMsg } = useStatusMessage(STATUS_AUTO_DISMISS_MS)
  // Change-history state: snapshots persisted to localStorage before every PUT,
  // plus the last successfully submitted YAML used to render the diff preview.
  const { history, addSnapshot } = useConfigHistory()
  const [lastSubmittedYaml, setLastSubmittedYaml] = useState<string | null>(null)
  const [diffOpen, setDiffOpen] = useState(true)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  // Guards one-time auto-load of the live server config into the editor on
  // first successful fetch, so operators see the actual running config
  // instead of DEFAULT_SAMPLE_YAML without a manual "Load from Server" click.
  const autoLoadedRef = useRef(false)

  // Auto-load the live server config into the editor on first successful
  // fetch. Without this the editor shows DEFAULT_SAMPLE_YAML and the operator
  // must manually click "Load from Server" to see the actual running config —
  // a confusing UX, especially when they then "Hot Reload" and would push the
  // stale sample YAML back to the server. The autoLoadedRef guard ensures we
  // only auto-populate once (on mount), not on every refetch, so subsequent
  // manual edits are not clobbered by background revalidations.
  useEffect(() => {
    if (autoLoadedRef.current) return
    const yamlText = rawConfigQuery.data
    if (!yamlText?.trim()) return
    autoLoadedRef.current = true
    setYamlContent(yamlText)
    loadFromYaml(yamlText)
  }, [rawConfigQuery.data, loadFromYaml])

  // ── YAML ↔ Form bridge ─────────────────────────────────────────────
  // "Import YAML → Form": parse the current Monaco editor content into the
  // configStore so the structured editors (Global/Node/Drivers/etc.) reflect
  // the YAML the user has been editing in code view.
  const handleImportYamlToForm = () => {
    loadFromYaml(yamlContent)
    // Read error directly from the store — the configError from the render
    // closure is stale because loadFromYaml just mutated the store.
    const err = useConfigStore.getState().error
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result)
      setYamlContent(text)
      loadFromYaml(text)
      const err = useConfigStore.getState().error
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
  const handleLoadTemplate = (template: ConfigTemplate) => {
    setYamlContent(template.yaml)
    loadFromYaml(template.yaml)
    const err = useConfigStore.getState().error
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

  const handleHotReload = async () => {
    setStatusMsg(null)
    // Persist a snapshot of the YAML being submitted BEFORE the PUT, so the
    // change history is recorded even if the server later rejects the reload.
    addSnapshot(yamlContent)
    setStatusMsg({ type: 'success', text: t('config.snapshotSaved') })
    try {
      await updateMutation.mutateAsync({ payload: yamlContent })
      setLastSubmittedYaml(yamlContent)
      setStatusMsg({
        type: 'success',
        text: t('config.reloadSuccess'),
      })
      refetch()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.reloadFailed')
      setStatusMsg({ type: 'error', text: msg || t('config.reloadFailed') })
    }
  }

  // Path A — "Load from Server": fetch the live server config (GET /configs/raw,
  // secrets redacted to ***) into both the YAML editor and the configStore so
  // the operator edits the server's REAL configuration rather than the sample.
  // The redacted "***" placeholders are restored to real values by the
  // executor's sentinel-merge on the next PUT /configs, so the operator never
  // needs to type a secret.
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
        loadFromYaml(yamlText)
        const err = useConfigStore.getState().error
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
        setStatusMsg({ type: 'success', text: t('config.dryRunValid') })
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

  // Derived overview values (graceful when the server omits a field).
  const apiListen = configData?.global?.api?.listen
  const secretSet = configData?.global?.api?.['secret-set']
  const drivers = configData?.drivers ?? []
  const transports = configData?.transports ?? []
  const rules = configData?.rules ?? []

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('config.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('config.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-muted p-0.5 rounded-lg border border-border text-xs">
            <button
              type="button"
              onClick={() => setMode('form')}
              aria-pressed={mode === 'form'}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors ${
                mode === 'form'
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{t('config.formView')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('yaml')}
              aria-pressed={mode === 'yaml'}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors ${
                mode === 'yaml'
                  ? 'bg-background text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{t('config.yamlCode')}</span>
            </button>
          </div>

          {/* YAML ↔ Form bridge buttons */}
          {mode === 'yaml' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportYamlToForm}
              className="h-8 text-xs"
              title={t('config.importYamlHint')}
            >
              <Sliders className="w-3.5 h-3.5 mr-1" />
              <span>{t('config.importYamlToForm')}</span>
            </Button>
          )}
          {mode === 'form' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncFormToYaml}
              disabled={!configWorkingExists}
              className="h-8 text-xs"
              title={t('config.syncFormHint')}
            >
              <Code2 className="w-3.5 h-3.5 mr-1" />
              <span>{t('config.syncFormToYaml')}</span>
            </Button>
          )}
          {/* File upload — available in both modes */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs"
            title={t('config.uploadFileHint')}
          >
            <Upload className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFileDownload}
            className="h-8 text-xs"
            title={t('config.downloadFileHint')}
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
          {/* Config templates — pre-built presets */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTemplatePickerOpen((v) => !v)}
              className="h-8 text-xs"
              title={t('config.templatesHint')}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
            </Button>
            {templatePickerOpen && (
              <>
                {/* Click-away overlay */}
                {/* biome-ignore lint/a11y/useSemanticElements: invisible click-away backdrop, not an interactive control */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setTemplatePickerOpen(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setTemplatePickerOpen(false)
                  }}
                  role="button"
                  tabIndex={-1}
                  aria-label="Close template picker"
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                  <div className="p-2 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
                      {t('config.templates')}
                    </p>
                    {CONFIG_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleLoadTemplate(tpl)}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{tpl.name}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                            {tpl.category}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {tpl.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Path A — Load from Server: fetch the live redacted config (secrets
              masked as ***) into the editor. Available in both modes so the
              operator can backfill the server's real config before editing. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadFromServer}
            disabled={rawConfigQuery.isFetching}
            className="h-8 text-xs"
            title={t('config.loadFromServerHint')}
          >
            <CloudDownload className="w-3.5 h-3.5" />
          </Button>
          {/* Path A — Dry-run Validate (YAML mode only, since the payload is
              the editor's YAML text). Validates on the server WITHOUT applying. */}
          {mode === 'yaml' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDryRunValidate}
              disabled={validateMutation.isPending}
              className="h-8 text-xs"
              title={t('config.dryRunValidateHint')}
            >
              <FlaskConical className="w-3.5 h-3.5 mr-1" />
              <span>
                {validateMutation.isPending
                  ? t('config.dryRunValidating')
                  : t('config.dryRunValidate')}
              </span>
            </Button>
          )}
          {mode === 'yaml' && (
            <Button
              size="sm"
              onClick={handleHotReload}
              disabled={updateMutation.isPending}
              className="h-8 text-xs glow-primary"
            >
              <Flame className="w-3.5 h-3.5 mr-1 text-amber-400" />
              <span>
                {updateMutation.isPending ? t('config.reloading') : t('config.hotReload')}
              </span>
            </Button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {mode === 'form' ? (
        <div className="space-y-4">
          {/* Runtime Parameter Patch Card */}
          <Card className="border-border/80 bg-card/60">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-primary" />
                <span>{t('config.runtimeParams')}</span>
              </CardTitle>
              <CardDescription className="text-xs">{t('config.runtimeParamsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    {t('config.globalLogLevel')}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('config.globalLogLevelDesc')}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {LOG_LEVELS.map((lvl) => (
                    <Button
                      key={lvl}
                      variant={currentLogLevel === lvl ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleLogLevelChange(lvl)}
                      disabled={patchMutation.isPending}
                      className="h-7 px-3 text-xs uppercase font-mono"
                    >
                      {lvl}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Real-time CoreC event log stream — placed directly below the
              runtime log-level patch card so the operator sees the effect of
              switching levels (e.g. debug) flow into the terminal instantly. */}
          <EventLogTerminal height="h-64" />

          {/* Current Configuration (synced from GET /configs overview) */}
          <Card className="border-border/80 bg-card/60">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center space-x-2">
                <ListChecks className="w-4 h-4 text-primary" />
                <span>{t('config.activeSummary')}</span>
              </CardTitle>
              <CardDescription className="text-xs">{t('config.activeSummaryDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-4">
              {isLoadingConfigs && !configData ? (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  {t('config.loadingOverview')}
                </div>
              ) : (
                <>
                  {/* Global + API summary tiles */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {t('config.globalLogLevel')}
                      </div>
                      <div className="font-mono text-xs font-bold text-foreground mt-1 uppercase">
                        {configData?.global?.['log-level'] ?? t('config.notAvailable')}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {t('config.apiListener')}
                      </div>
                      <div className="font-mono text-xs font-bold text-foreground mt-1">
                        {apiListen ?? t('config.notAvailable')}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center space-x-1">
                        <KeyRound className="w-3 h-3" />
                        <span>{t('config.apiSecret')}</span>
                      </div>
                      <div className="mt-1">
                        {secretSet === undefined ? (
                          <span className="text-xs text-muted-foreground">
                            {t('config.notAvailable')}
                          </span>
                        ) : secretSet ? (
                          <Badge variant="success">{t('config.secretSet')}</Badge>
                        ) : (
                          <Badge variant="warning">{t('config.secretUnset')}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {t('config.components')}
                      </div>
                      <div className="font-mono text-xs font-bold text-foreground mt-1">
                        {t('config.componentsTotal', {
                          count: drivers.length + transports.length + rules.length,
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Drivers / Transports / Rules summaries */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <ComponentList
                      title={t('config.drivers')}
                      icon={<Cpu className="w-3 h-3 text-primary" />}
                      entries={drivers}
                      typeLabel={t('config.colType')}
                      emptyText={t('config.noDrivers')}
                    />
                    <ComponentList
                      title={t('config.transports')}
                      icon={<Network className="w-3 h-3 text-primary" />}
                      entries={transports}
                      typeLabel={t('config.colType')}
                      emptyText={t('config.noTransports')}
                    />
                    <ComponentList
                      title={t('config.rules')}
                      icon={<ListChecks className="w-3 h-3 text-primary" />}
                      entries={rules}
                      typeLabel={t('config.colMatch')}
                      emptyText={t('config.noRules')}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Dirty banner for configStore-managed edits */}
          {configDirty && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
              <span>{t('config.unsavedChanges')}</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => useConfigStore.getState().revert()}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={hasValidationErrors}
                  onClick={() => setGlobalApplyOpen(true)}
                >
                  {t('config.applyChanges')}
                </Button>
              </div>
            </div>
          )}

          {/* Live validation errors banner */}
          <ValidationBanner />

          {/* Structured global config editor */}
          <GlobalConfigEditor />

          {/* Structured node config editor */}
          <NodeConfigEditor />

          {/* Rule providers editor */}
          <RuleProviderEditor />

          {/* Rule groups editor */}
          <RuleGroupEditor />

          {/* Apply confirmation for configStore edits */}
          <ConfigApplyConfirmationDialog
            open={globalApplyOpen}
            onOpenChange={setGlobalApplyOpen}
            beforeYaml={getSavedYaml() ?? ''}
            afterYaml={getWorkingYaml() ?? ''}
            applying={updateMutation.isPending}
            validationErrors={hasValidationErrors ? validationErrorStrings : undefined}
            onConfirm={() => {
              // Guard: never apply if validation failed. The apply button
              // is also disabled, but this is a belt-and-suspenders check.
              if (hasValidationErrors) return
              const yaml = getWorkingYaml() ?? ''
              updateMutation.mutate(
                { payload: yaml },
                {
                  onSuccess: () => {
                    markSaved()
                    setGlobalApplyOpen(false)
                    refetch()
                  },
                },
              )
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Changes Preview — diff against the last submitted YAML */}
          {lastSubmittedYaml !== null && (
            <Card className="border-border/80 bg-card/60">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center space-x-2">
                  <GitCompare className="w-4 h-4 text-primary" />
                  <div className="space-y-0.5">
                    <CardTitle className="text-sm font-semibold">{t('config.diff')}</CardTitle>
                    <CardDescription className="text-xs">{t('config.diffDesc')}</CardDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDiffOpen((open) => !open)}
                  aria-expanded={diffOpen}
                  aria-label={t('config.diffToggle')}
                  className="h-7 w-7"
                >
                  {diffOpen ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              </CardHeader>
              {diffOpen && (
                <CardContent className="p-4 pt-1">
                  {hasDiffChanges ? (
                    <div className="rounded-lg border border-border/50 overflow-hidden">
                      <div className="flex items-center space-x-4 px-3 py-1.5 bg-muted/40 border-b border-border/50 text-[10px]">
                        <span className="flex items-center space-x-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40" />
                          <span className="text-muted-foreground">{t('config.diffAdded')}</span>
                        </span>
                        <span className="flex items-center space-x-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/40" />
                          <span className="text-muted-foreground">{t('config.diffRemoved')}</span>
                        </span>
                      </div>
                      <ScrollArea className="h-72">
                        <div className="font-mono text-xs">
                          {diffLines.map((line, idx) => (
                            <div
                              key={`diff-${idx}`}
                              className={`px-3 py-0.5 whitespace-pre-wrap break-all ${
                                line.type === 'added'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : line.type === 'removed'
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : 'text-muted-foreground'
                              }`}
                            >
                              <span className="inline-block w-4 select-none">
                                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                              </span>
                              {line.text === '' ? '\u00A0' : line.text}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-4 text-center">
                      {t('config.diffNoChanges')}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* YAML Monaco Editor */}
          <Card className="border-border/80 bg-card/60 overflow-hidden">
            <CardHeader className="p-3 bg-muted/30 border-b border-border/60 flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-mono text-muted-foreground">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>{t('config.corecYaml')}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{t('config.envVarNote')}</span>
            </CardHeader>
            <div className="h-[480px]">
              <Editor
                height="100%"
                defaultLanguage="yaml"
                value={yamlContent}
                onChange={(val) => setYamlContent(val || '')}
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', Consolas, monospace",
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                }}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Change History — persisted snapshots of every PUT /configs submission */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <History className="w-4 h-4 text-primary" />
            <span>{t('config.history')}</span>
          </CardTitle>
          <CardDescription className="text-xs">{t('config.historyDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          {history.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              {t('config.historyEmpty')}
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-3">
                {history.map((snap, idx) => (
                  <div
                    key={`snap-${snap.timestamp}-${idx}`}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-foreground">
                        {new Date(snap.timestamp).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {snap.action}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestore(snap)}
                      className="h-7 text-xs shrink-0"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {t('config.restore')}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
