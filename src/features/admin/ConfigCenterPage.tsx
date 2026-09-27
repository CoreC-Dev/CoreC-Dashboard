import Editor from '@monaco-editor/react'
import { AlertCircle, CheckCircle2, Code2, FileText, Flame, Sliders } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useConfigs, usePatchConfig, useUpdateConfig } from '@/api/hooks'
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

export const ConfigCenterPage: React.FC = () => {
  const { resolvedTheme } = useThemeStore()
  const { data: configData, refetch } = useConfigs()
  const patchMutation = usePatchConfig()
  const updateMutation = useUpdateConfig()

  const [mode, setMode] = useState<'form' | 'yaml'>('form')
  const [yamlContent, setYamlContent] = useState(DEFAULT_SAMPLE_YAML)
  const [currentLogLevel, setCurrentLogLevel] = useState<string>('info')
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  const handleLogLevelChange = async (lvl: string) => {
    setCurrentLogLevel(lvl)
    setStatusMsg(null)
    try {
      await patchMutation.mutateAsync({ 'log-level': lvl })
      setStatusMsg({ type: 'success', text: `Log level updated to ${lvl} in CoreC runtime` })
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to update log level' })
    }
  }

  const handleHotReload = async () => {
    setStatusMsg(null)
    try {
      await updateMutation.mutateAsync({ payload: yamlContent })
      setStatusMsg({
        type: 'success',
        text: 'Configuration diff applied and hot reloaded successfully!',
      })
      refetch()
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Hot reload failed' })
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Configuration Center</h1>
          <p className="text-xs text-muted-foreground">
            Differential hot-reload (Suspend &rarr; Diff &rarr; Apply &rarr; Resume) & runtime
            parameter tuning
          </p>
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
              <span>Form View</span>
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
              <span>YAML Code</span>
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
              <span>{updateMutation.isPending ? 'Reloading...' : 'Hot Reload Core'}</span>
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
                <span>Runtime Live Parameters (Zero Downtime)</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Parameters that can be altered instantaneously via PATCH /configs
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                <div>
                  <div className="text-xs font-semibold text-foreground">Global Log Level</div>
                  <div className="text-[11px] text-muted-foreground">
                    Modifies engine logging verbosity on the fly
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {['debug', 'info', 'warn', 'error'].map((lvl) => (
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

          {/* Configuration Summary Card */}
          <Card className="border-border/80 bg-card/60">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Active Configuration Summary</CardTitle>
              <CardDescription className="text-xs">
                Reflected from CoreC GET /configs endpoint
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                    API Listener
                  </div>
                  <div className="font-mono text-xs font-bold text-foreground mt-1">
                    {configData?.global?.api?.listen || '0.0.0.0:9090'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                    Drivers Registered
                  </div>
                  <div className="font-mono text-xs font-bold text-foreground mt-1">
                    {configData?.drivers?.length || 0} Southbound units
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                    Transports Registered
                  </div>
                  <div className="font-mono text-xs font-bold text-foreground mt-1">
                    {configData?.transports?.length || 0} Northbound channels
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* YAML Monaco Editor */
        <Card className="border-border/80 bg-card/60 overflow-hidden">
          <CardHeader className="p-3 bg-muted/30 border-b border-border/60 flex flex-row items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-mono text-muted-foreground">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>corec.yaml</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Supports ${'{ENV_VAR}'} placeholder resolution
            </span>
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
