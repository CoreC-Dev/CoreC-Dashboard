import { Database, Gauge } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { RestartBadge } from '@/components/admin/DetailPageParts'
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
import type { GlobalConfig } from '@/types/config'
import { LOG_FORMATS, LOG_LEVELS } from '@/types/config'

// ─── FieldRow wrapper ───────────────────────────────────────────────

interface FieldRowProps {
  label: string
  help?: string
  required?: boolean
  restartRequired?: boolean
  children: React.ReactNode
}

export const FieldRow: React.FC<FieldRowProps> = ({
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

// ─── Section header ─────────────────────────────────────────────────

export const SectionHeader: React.FC<{
  icon: React.ReactNode
  labelKey: string
  restart?: boolean
}> = ({ icon, labelKey, restart }) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {icon}
      {t(labelKey)}
      {restart && <RestartBadge label={t('globalConfig.restartRequired')} />}
    </div>
  )
}

export const sectionGridCls =
  'grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border'
export const detailsGridCls =
  'grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 mt-2 rounded-lg bg-muted/20 border border-border/30'

// ─── LoggingSection ─────────────────────────────────────────────────

export const LoggingSection: React.FC<{
  global: GlobalConfig
  update: (path: string, value: unknown) => void
}> = ({ global, update }) => {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SectionHeader
        icon={<Gauge className="w-3.5 h-3.5" />}
        labelKey="globalConfig.sectionLogging"
      />
      <div className={sectionGridCls}>
        <FieldRow label={t('globalConfig.logLevel')} help={t('globalConfig.logLevelHelp')}>
          <Select
            value={(global['log-level'] as string) ?? 'info'}
            onValueChange={(v) => update('log-level', v)}
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
            onValueChange={(v) => update('log-format', v)}
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
  )
}

// ─── BufferSection ──────────────────────────────────────────────────

export const BufferSection: React.FC<{
  buffer: NonNullable<GlobalConfig['buffer']>
  update: (path: string, value: unknown) => void
}> = ({ buffer, update }) => {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SectionHeader
        icon={<Database className="w-3.5 h-3.5" />}
        labelKey="globalConfig.sectionBuffer"
        restart
      />
      <div className={sectionGridCls}>
        <FieldRow
          label={t('globalConfig.bufferEnabled')}
          help={t('globalConfig.bufferEnabledHelp')}
          restartRequired
        >
          <div className="flex items-center gap-2 h-8">
            <Switch
              checked={(buffer.enabled as boolean) ?? false}
              onCheckedChange={(v) => update('buffer.enabled', v)}
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
              update('buffer.max-size', e.target.value ? Number(e.target.value) : undefined)
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
            onChange={(e) => update('buffer.path', e.target.value || undefined)}
            placeholder="/var/lib/corec/buffer"
            className="h-8 text-xs font-mono"
          />
        </FieldRow>
      </div>
    </div>
  )
}
