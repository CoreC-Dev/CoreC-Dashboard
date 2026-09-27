import Editor from '@monaco-editor/react'
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Cpu,
  FileText,
  Flame,
  KeyRound,
  ListChecks,
  Network,
  Sliders,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigs, usePatchConfig, useUpdateConfig } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    } catch (err: any) {
      setCurrentLogLevel(prev)
      setStatusMsg({ type: 'error', text: err.message || t('config.logLevelUpdateFailed') })
    }
  }

  const handleHotReload = async () => {
    setStatusMsg(null)
    try {
      await updateMutation.mutateAsync({ payload: yamlContent })
      setStatusMsg({
        type: 'success',
        text: t('config.reloadSuccess'),
      })
      refetch()
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || t('config.reloadFailed') })
    }
  }

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
        /* YAML Monaco Editor */
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
      )}
    </div>
  )
}
