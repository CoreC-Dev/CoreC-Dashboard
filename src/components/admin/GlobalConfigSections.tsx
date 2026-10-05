import { Bug, Cpu, Network, RotateCcw } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import {
  detailsGridCls,
  FieldRow,
  SectionHeader,
  sectionGridCls,
} from '@/components/admin/GlobalConfigParts'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { GlobalConfig } from '@/types/config'
import { ON_BAD_QUALITY_POLICIES } from '@/types/config'

// ─── ApiSection ─────────────────────────────────────────────────────

export const ApiSection: React.FC<{
  api: NonNullable<GlobalConfig['api']>
  update: (path: string, value: unknown) => void
}> = ({ api, update }) => {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SectionHeader
        icon={<Network className="w-3.5 h-3.5" />}
        labelKey="globalConfig.sectionApi"
        restart
      />
      <div className={sectionGridCls}>
        <FieldRow
          label={t('globalConfig.apiListen')}
          help={t('globalConfig.apiListenHelp')}
          restartRequired
        >
          <Input
            value={(api.listen as string) ?? ''}
            onChange={(e) => update('api.listen', e.target.value || undefined)}
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
            onChange={(e) => update('api.secret', e.target.value || undefined)}
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
              update('api.rate-limit-per-sec', e.target.value ? Number(e.target.value) : undefined)
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
              update('api.allowed-origins', lines.length > 0 ? lines : undefined)
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
            onChange={(e) => update('api.tls-cert', e.target.value || undefined)}
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
            onChange={(e) => update('api.tls-key', e.target.value || undefined)}
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
        <div className={`${detailsGridCls} details-reveal`}>
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
                onChange={(e) => update(`api.${key}`, e.target.value || undefined)}
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
        <div className="details-reveal space-y-3 p-3 mt-2 rounded-lg bg-muted/20 border border-border/30">
          <FieldRow
            label={t('globalConfig.pprofDisabled')}
            help={t('globalConfig.pprofDisabledHelp')}
            restartRequired
          >
            <Checkbox
              checked={Boolean(api['pprof-disabled'])}
              onCheckedChange={(checked) =>
                update('api.pprof-disabled', Boolean(checked) || undefined)
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
              onChange={(e) => update('api.pprof-addr', e.target.value || undefined)}
              placeholder="127.0.0.1:6060"
              className="h-8 text-xs font-mono"
            />
          </FieldRow>
        </div>
      </details>
    </div>
  )
}

// ─── EngineSection ──────────────────────────────────────────────────

export const EngineSection: React.FC<{
  engine: NonNullable<GlobalConfig['engine']>
  update: (path: string, value: unknown) => void
}> = ({ engine, update }) => {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SectionHeader
        icon={<Cpu className="w-3.5 h-3.5" />}
        labelKey="globalConfig.sectionEngine"
        restart
      />
      <div className={sectionGridCls}>
        <FieldRow
          label={t('globalConfig.engineDataBusSize')}
          help={t('globalConfig.engineDataBusSizeHelp')}
          restartRequired
        >
          <Input
            type="number"
            value={(engine['data-bus-size'] as number) ?? ''}
            onChange={(e) =>
              update('engine.data-bus-size', e.target.value ? Number(e.target.value) : undefined)
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
              update('engine.workers', e.target.value ? Number(e.target.value) : undefined)
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
            onChange={(e) => update('engine.shutdown-timeout', e.target.value || undefined)}
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
            onChange={(e) => update('engine.stale-threshold', e.target.value || undefined)}
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
              update(
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
              update(
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
            onChange={(e) => update('engine.default-tag-interval', e.target.value || undefined)}
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
            onValueChange={(v) => update('engine.on-bad-quality', v)}
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

        <FieldRow
          label={t('globalConfig.engineErrorThrottleWindow')}
          help={t('globalConfig.engineErrorThrottleWindowHelp')}
          restartRequired
        >
          <Input
            value={(engine['error-throttle-window'] as string) ?? ''}
            onChange={(e) => update('engine.error-throttle-window', e.target.value || undefined)}
            placeholder="10s"
            className="h-8 text-xs font-mono"
          />
        </FieldRow>

        <FieldRow
          label={t('globalConfig.engineHighPriorityWorkers')}
          help={t('globalConfig.engineHighPriorityWorkersHelp')}
          restartRequired
        >
          <Input
            type="number"
            value={(engine['high-priority-workers'] as number) ?? ''}
            onChange={(e) =>
              update(
                'engine.high-priority-workers',
                e.target.value ? Number(e.target.value) : undefined,
              )
            }
            placeholder="2"
            min={0}
            className="h-8 text-xs font-mono w-28"
          />
        </FieldRow>
      </div>
    </div>
  )
}
