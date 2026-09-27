import Editor from '@monaco-editor/react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Cpu,
  FileText,
  Flame,
  GitCompare,
  History,
  KeyRound,
  ListChecks,
  Network,
  RotateCcw,
  Sliders,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigs, usePatchConfig, useUpdateConfig } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useThemeStore } from '@/stores/themeStore'

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

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

const STATUS_AUTO_DISMISS_MS = 2500

const HISTORY_STORAGE_KEY = 'corec_config_history'
const MAX_HISTORY_SNAPSHOTS = 10

interface ConfigSnapshot {
  timestamp: number
  yaml: string
  action: string
}

type DiffLineType = 'equal' | 'added' | 'removed'

interface DiffLine {
  type: DiffLineType
  text: string
  oldLineNo: number | null
  newLineNo: number | null
}

// Load persisted config snapshots from localStorage; tolerates malformed or
// missing data so a corrupted entry never crashes the page.
function loadHistory(): ConfigSnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (e): e is ConfigSnapshot =>
          typeof e === 'object' &&
          e !== null &&
          typeof e.timestamp === 'number' &&
          typeof e.yaml === 'string' &&
          typeof e.action === 'string',
      )
      .slice(0, MAX_HISTORY_SNAPSHOTS)
  } catch {
    return []
  }
}

// Persist snapshots (capped to MAX_HISTORY_SNAPSHOTS); swallows quota / serialize
// errors so a failing storage backend never blocks the submit flow.
function persistHistory(entries: ConfigSnapshot[]): void {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_HISTORY_SNAPSHOTS)),
    )
  } catch {
    // ignore — history is best-effort
  }
}

// Line-by-line diff via longest-common-subsequence backtracking. Produces a
// flat list of equal / added / removed lines the UI can render directly; a
// changed line surfaces as a removed line followed by the added one.
function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const m = oldLines.length
  const n = newLines.length

  // dp[i][j] = length of the LCS of oldLines[i..] and newLines[j..]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  let oldNo = 1
  let newNo = 1
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'equal', text: oldLines[i], oldLineNo: oldNo++, newLineNo: newNo++ })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: oldLines[i], oldLineNo: oldNo++, newLineNo: null })
      i++
    } else {
      result.push({ type: 'added', text: newLines[j], oldLineNo: null, newLineNo: newNo++ })
      j++
    }
  }
  while (i < m) {
    result.push({ type: 'removed', text: oldLines[i], oldLineNo: oldNo++, newLineNo: null })
    i++
  }
  while (j < n) {
    result.push({ type: 'added', text: newLines[j], oldLineNo: null, newLineNo: newNo++ })
    j++
  }
  return result
}

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
        entries.map((e, i) => (
          <div
            key={`${title}-${e.name}-${i}`}
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

  const [mode, setMode] = useState<'form' | 'yaml'>('form')
  const [yamlContent, setYamlContent] = useState(DEFAULT_SAMPLE_YAML)
  const [currentLogLevel, setCurrentLogLevel] = useState<string>('info')
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )
  // Change-history state: snapshots persisted to localStorage before every PUT,
  // plus the last successfully submitted YAML used to render the diff preview.
  const [history, setHistory] = useState<ConfigSnapshot[]>(() => loadHistory())
  const [lastSubmittedYaml, setLastSubmittedYaml] = useState<string | null>(null)
  const [diffOpen, setDiffOpen] = useState(true)

  // Auto-dismiss the status notice and clear the pending timer on unmount so we
  // never call setState on a disposed component.
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!statusMsg) return
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => {
      setStatusMsg(null)
      statusTimerRef.current = null
    }, STATUS_AUTO_DISMISS_MS)
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current)
        statusTimerRef.current = null
      }
    }
  }, [statusMsg])

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
    const snapshot: ConfigSnapshot = {
      timestamp: Date.now(),
      yaml: yamlContent,
      action: 'PUT /configs',
    }
    const nextHistory = [snapshot, ...history].slice(0, MAX_HISTORY_SNAPSHOTS)
    setHistory(nextHistory)
    persistHistory(nextHistory)
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

  // Restore a history snapshot into the YAML editor and switch to code view.
  const handleRestore = (snap: ConfigSnapshot) => {
    setYamlContent(snap.yaml)
    setMode('yaml')
    setStatusMsg({ type: 'success', text: t('config.restored') })
  }

  // Line-by-line diff between the editor content and the last submitted YAML.
  // Empty when no prior submission exists, in which case the preview is skipped.
  const diffLines = useMemo<DiffLine[]>(() => {
    if (lastSubmittedYaml === null) return []
    return computeDiff(lastSubmittedYaml, yamlContent)
  }, [lastSubmittedYaml, yamlContent])
  const hasDiffChanges = diffLines.some((line) => line.type !== 'equal')

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
