/**
 * GlobalConfigEditor
 *
 * Structured form editor for the `global` section of CoreCConfig.
 * Covers: log-level, log-format, api.*, engine.*, buffer.*
 *
 * This addresses the user's request: "各种没有体现到Dashboard能修改的配置
 * 但CoreC已经实现的配置" — these global settings were previously only
 * editable via the raw Monaco YAML editor. Now each field has a proper
 * UI control with labels, help text, and validation hints.
 *
 * Integration: edits go through configStore.updateGlobalField(), which
 * updates the working config and sets dirty=true. The parent page
 * (ConfigCenterPage) handles the Apply/Revert flow via PUT /configs.
 *
 * Hot-reload semantics (from CoreC config.go):
 *   - log-level: hot-updatable (also via PATCH /configs)
 *   - log-format: requires restart
 *   - api.*: requires restart (listen address, TLS, timeouts)
 *   - engine.*: requires restart (workers, bus size, thresholds)
 *   - buffer.*: requires restart (buffer path, max-size)
 *
 * Fields requiring restart are marked with a warning badge.
 */
import { Bug, Cpu, Database, Gauge, Network, RotateCcw, Sliders } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RestartBadge } from '@/components/admin/DetailPageParts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfigStore } from '@/stores/configStore'
import { type GlobalConfig, LOG_FORMATS, LOG_LEVELS, ON_BAD_QUALITY_POLICIES } from '@/types/config'

// ─── Field row wrapper ───────────────────────────────────────────────

interface FieldRowProps {
  label: string
  help?: string
  required?: boolean
  restartRequired?: boolean
  children: React.ReactNode
}

const FieldRow: React.FC<FieldRowProps> = ({
  label,
  help,
  required,
  restartRequired,
  children,
}) => {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        <RestartBadge show={restartRequired ?? false} label={t('globalConfig.restartRequired')} />
      </div>
      {children}
      {help && <p className="text-xs text-muted-foreground leading-snug">{help}</p>}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────

export const GlobalConfigEditor: React.FC = () => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const updateGlobalField = useConfigStore((s) => s.updateGlobalField)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const dirty = useConfigStore((s) => s.dirty)

  const [expanded, setExpanded] = useState(true)

  if (!workingConfig) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            <span>{t('globalConfig.title')}</span>
          </CardTitle>
          <CardDescription className="text-xs">{t('globalConfig.noConfigDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetToEmpty()}
            className="h-8 text-xs"
          >
            <Sliders className="w-3.5 h-3.5 mr-1.5" />
            {t('globalConfig.initConfig')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const global: GlobalConfig = workingConfig.global ?? {}
  const api = global.api ?? {}
  const engine = global.engine ?? {}
  const buffer = global.buffer ?? {}

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            <span>{t('globalConfig.title')}</span>
            {dirty && (
              <Badge
                variant="outline"
                className="text-xs border-status-warning/40 text-status-warning"
              >
                {t('globalConfig.unsaved')}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? t('common.collapse') : t('common.expand')}
          </Button>
        </div>
        <CardDescription className="text-xs">{t('globalConfig.desc')}</CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 pt-1 space-y-4">
          {/* ─── Logging section ─────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Gauge className="w-3.5 h-3.5" />
              {t('globalConfig.sectionLogging')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <FieldRow label={t('globalConfig.logLevel')} help={t('globalConfig.logLevelHelp')}>
                <Select
                  value={(global['log-level'] as string) ?? 'info'}
                  onValueChange={(v) => updateGlobalField('log-level', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_LEVELS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl} className="text-xs font-mono">
                        {lvl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow
                label={t('globalConfig.logFormat')}
                help={t('globalConfig.logFormatHelp')}
                restartRequired
              >
                <Select
                  value={(global['log-format'] as string) || 'text'}
                  onValueChange={(v) => updateGlobalField('log-format', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_FORMATS.map((fmt) => (
                      <SelectItem key={fmt} value={fmt} className="text-xs font-mono">
                        {fmt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>
          </div>

          {/* ─── API section ─────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Network className="w-3.5 h-3.5" />
              {t('globalConfig.sectionApi')}
              <RestartBadge label={t('globalConfig.restartRequired')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <FieldRow
                label={t('globalConfig.apiListen')}
                help={t('globalConfig.apiListenHelp')}
                restartRequired
              >
                <Input
                  value={(api.listen as string) ?? ''}
                  onChange={(e) => updateGlobalField('api.listen', e.target.value || undefined)}
                  placeholder="0.0.0.0:9090"
                  className="h-8 text-xs font-mono"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.apiSecret')}
                help={t('globalConfig.apiSecretHelp')}
                restartRequired
              >
                <Input
                  type="password"
                  value={(api.secret as string) ?? ''}
                  onChange={(e) => updateGlobalField('api.secret', e.target.value || undefined)}
                  placeholder="••••••••"
                  className="h-8 text-xs font-mono"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.apiRateLimit')}
                help={t('globalConfig.apiRateLimitHelp')}
                restartRequired
              >
                <Input
                  type="number"
                  value={(api['rate-limit-per-sec'] as number) ?? ''}
                  onChange={(e) =>
                    updateGlobalField(
                      'api.rate-limit-per-sec',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="100"
                  min={0}
                  className="h-8 text-xs font-mono w-24"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.apiAllowedOrigins')}
                help={t('globalConfig.apiAllowedOriginsHelp')}
                restartRequired
              >
                <Textarea
                  value={
                    Array.isArray(api['allowed-origins'])
                      ? (api['allowed-origins'] as string[]).join('\n')
                      : ''
                  }
                  onChange={(e) => {
                    const lines = e.target.value
                      .split('\n')
                      .map((l) => l.trim())
                      .filter(Boolean)
                    updateGlobalField('api.allowed-origins', lines.length > 0 ? lines : undefined)
                  }}
                  placeholder={'https://example.com\nhttps://app.example.com'}
                  rows={2}
                  className="text-xs font-mono"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.apiTlsCert')}
                help={t('globalConfig.apiTlsCertHelp')}
                restartRequired
              >
                <Input
                  value={(api['tls-cert'] as string) ?? ''}
                  onChange={(e) => updateGlobalField('api.tls-cert', e.target.value || undefined)}
                  placeholder="/path/to/cert.pem"
                  className="h-8 text-xs font-mono"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.apiTlsKey')}
                help={t('globalConfig.apiTlsKeyHelp')}
                restartRequired
              >
                <Input
                  value={(api['tls-key'] as string) ?? ''}
                  onChange={(e) => updateGlobalField('api.tls-key', e.target.value || undefined)}
                  placeholder="/path/to/key.pem"
                  className="h-8 text-xs font-mono"
                />
              </FieldRow>
            </div>

            {/* API timeouts (advanced) */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <RotateCcw className="w-3 h-3 group-open:rotate-90 transition-transform" />
                {t('globalConfig.apiTimeouts')}
              </summary>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 mt-2 rounded-lg bg-muted/20 border border-border/30">
                {(
                  [
                    ['read-header-timeout', t('globalConfig.readHeaderTimeout')],
                    ['read-timeout', t('globalConfig.readTimeout')],
                    ['write-timeout', t('globalConfig.writeTimeout')],
                    ['idle-timeout', t('globalConfig.idleTimeout')],
                  ] as const
                ).map(([key, label]) => (
                  <FieldRow key={key} label={label} restartRequired>
                    <Input
                      value={(api[key] as string) ?? ''}
                      onChange={(e) => updateGlobalField(`api.${key}`, e.target.value || undefined)}
                      placeholder="30s"
                      className="h-8 text-xs font-mono"
                    />
                  </FieldRow>
                ))}
              </div>
            </details>

            {/* API pprof (advanced) */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Bug className="w-3 h-3 group-open:rotate-90 transition-transform" />
                {t('globalConfig.apiPprof')}
              </summary>
              <div className="space-y-3 p-3 mt-2 rounded-lg bg-muted/20 border border-border/30">
                <FieldRow
                  label={t('globalConfig.pprofDisabled')}
                  help={t('globalConfig.pprofDisabledHelp')}
                  restartRequired
                >
                  <Checkbox
                    checked={Boolean(api['pprof-disabled'])}
                    onCheckedChange={(checked) =>
                      updateGlobalField('api.pprof-disabled', Boolean(checked) || undefined)
                    }
                  />
                </FieldRow>
                <FieldRow
                  label={t('globalConfig.pprofAddr')}
                  help={t('globalConfig.pprofAddrHelp')}
                  restartRequired
                >
                  <Input
                    value={(api['pprof-addr'] as string) ?? ''}
                    onChange={(e) =>
                      updateGlobalField('api.pprof-addr', e.target.value || undefined)
                    }
                    placeholder="127.0.0.1:6060"
                    className="h-8 text-xs font-mono"
                  />
                </FieldRow>
              </div>
            </details>
          </div>

          {/* ─── Engine section ──────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Cpu className="w-3.5 h-3.5" />
              {t('globalConfig.sectionEngine')}
              <RestartBadge label={t('globalConfig.restartRequired')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <FieldRow
                label={t('globalConfig.engineDataBusSize')}
                help={t('globalConfig.engineDataBusSizeHelp')}
                restartRequired
              >
                <Input
                  type="number"
                  value={(engine['data-bus-size'] as number) ?? ''}
                  onChange={(e) =>
                    updateGlobalField(
                      'engine.data-bus-size',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="8192"
                  min={1}
                  className="h-8 text-xs font-mono w-28"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.engineWorkers')}
                help={t('globalConfig.engineWorkersHelp')}
                restartRequired
              >
                <Input
                  type="number"
                  value={(engine.workers as number) ?? ''}
                  onChange={(e) =>
                    updateGlobalField(
                      'engine.workers',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="0 (auto)"
                  min={0}
                  className="h-8 text-xs font-mono w-28"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.engineShutdownTimeout')}
                help={t('globalConfig.engineShutdownTimeoutHelp')}
                restartRequired
              >
                <Input
                  value={(engine['shutdown-timeout'] as string) ?? ''}
                  onChange={(e) =>
                    updateGlobalField('engine.shutdown-timeout', e.target.value || undefined)
                  }
                  placeholder="10s"
                  className="h-8 text-xs font-mono"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.engineStaleThreshold')}
                help={t('globalConfig.engineStaleThresholdHelp')}
                restartRequired
              >
                <Input
                  value={(engine['stale-threshold'] as string) ?? ''}
                  onChange={(e) =>
                    updateGlobalField('engine.stale-threshold', e.target.value || undefined)
                  }
                  placeholder="30s"
                  className="h-8 text-xs font-mono"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.engineWriteRetryCount')}
                help={t('globalConfig.engineWriteRetryCountHelp')}
                restartRequired
              >
                <Input
                  type="number"
                  value={(engine['write-retry-count'] as number) ?? ''}
                  onChange={(e) =>
                    updateGlobalField(
                      'engine.write-retry-count',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="3"
                  min={0}
                  className="h-8 text-xs font-mono w-28"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.engineCommandConcurrency')}
                help={t('globalConfig.engineCommandConcurrencyHelp')}
                restartRequired
              >
                <Input
                  type="number"
                  value={(engine['command-concurrency'] as number) ?? ''}
                  onChange={(e) =>
                    updateGlobalField(
                      'engine.command-concurrency',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="16"
                  min={1}
                  className="h-8 text-xs font-mono w-28"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.engineDefaultTagInterval')}
                help={t('globalConfig.engineDefaultTagIntervalHelp')}
                restartRequired
              >
                <Input
                  value={(engine['default-tag-interval'] as string) ?? ''}
                  onChange={(e) =>
                    updateGlobalField('engine.default-tag-interval', e.target.value || undefined)
                  }
                  placeholder="1s"
                  className="h-8 text-xs font-mono"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.engineOnBadQuality')}
                help={t('globalConfig.engineOnBadQualityHelp')}
                restartRequired
              >
                <Select
                  value={(engine['on-bad-quality'] as string) ?? 'publish'}
                  onValueChange={(v) => updateGlobalField('engine.on-bad-quality', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ON_BAD_QUALITY_POLICIES.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs font-mono">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>
          </div>

          {/* ─── Buffer section ──────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Database className="w-3.5 h-3.5" />
              {t('globalConfig.sectionBuffer')}
              <RestartBadge label={t('globalConfig.restartRequired')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <FieldRow
                label={t('globalConfig.bufferEnabled')}
                help={t('globalConfig.bufferEnabledHelp')}
                restartRequired
              >
                <div className="flex items-center gap-2 h-8">
                  <Switch
                    checked={(buffer.enabled as boolean) ?? false}
                    onCheckedChange={(v) => updateGlobalField('buffer.enabled', v)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {(buffer.enabled as boolean) ? t('common.enabled') : t('common.disabled')}
                  </span>
                </div>
              </FieldRow>

              <FieldRow
                label={t('globalConfig.bufferMaxSize')}
                help={t('globalConfig.bufferMaxSizeHelp')}
                restartRequired
              >
                <Input
                  type="number"
                  value={(buffer['max-size'] as number) ?? ''}
                  onChange={(e) =>
                    updateGlobalField(
                      'buffer.max-size',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="10000"
                  min={10}
                  className="h-8 text-xs font-mono w-28"
                />
              </FieldRow>

              <FieldRow
                label={t('globalConfig.bufferPath')}
                help={t('globalConfig.bufferPathHelp')}
                required={(buffer.enabled as boolean) ?? false}
                restartRequired
              >
                <Input
                  value={(buffer.path as string) ?? ''}
                  onChange={(e) => updateGlobalField('buffer.path', e.target.value || undefined)}
                  placeholder="/var/lib/corec/buffer"
                  className="h-8 text-xs font-mono"
                />
              </FieldRow>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
