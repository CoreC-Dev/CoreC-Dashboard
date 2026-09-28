/**
 * TransportWizard
 *
 * Multi-step wizard for creating or editing a transport configuration.
 * Steps:
 *   Step 1 — Transport Type: choose protocol (mqtt or http)
 *   Step 2 — Connection: transport name + broker URL / HTTP endpoint settings
 *   Step 3 — Publishing: batch-size, flush-interval, retry-count, buffer-size, fallback
 *   Step 4 — Advanced: reconnect backoff, TLS, command channel (per type)
 *   Step 5 — Preview & Save: YAML preview → configStore.upsertTransport
 *
 * Edit mode: when `existingTransport` is provided, the form is pre-filled
 * and the type step is locked.
 *
 * Decision-independent: works under both backend paths because it only
 * interacts with configStore.
 */
import { AlertCircle, CheckCircle2, Network, Zap } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WizardDialog, type WizardStep } from '@/components/wizard/Wizard'
import { useTransportNames } from '@/hooks/useConfigValidation'
import { dumpConfigYaml } from '@/lib/configYaml'
import { validateTransportInContext } from '@/lib/entityValidation'
import type { SettingsField } from '@/lib/settingsRegistry'
import {
  buildDefaultSettings,
  getTransportFieldRegistry,
  TRANSPORT_TOPLEVEL_FIELDS,
} from '@/lib/settingsRegistry'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import type { TransportConfig, TransportType } from '@/types/config'

// ─── Transport type metadata ──────────────────────────────────────────

interface TransportTypeMeta {
  type: TransportType
  label: string
  icon: React.ReactNode
  description: string
}

const TRANSPORT_TYPE_META: TransportTypeMeta[] = [
  {
    type: 'mqtt',
    label: 'MQTT',
    icon: <Zap className="h-5 w-5" />,
    description: 'Publish to MQTT broker (topic templates, QoS, retained)',
  },
  {
    type: 'http',
    label: 'HTTP / Webhook',
    icon: <Network className="h-5 w-5" />,
    description: 'POST to HTTP endpoint or receive webhooks',
  },
]

// ─── Component ───────────────────────────────────────────────────────

export interface TransportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTransport?: TransportConfig
  onSaved?: () => void
}

export const TransportWizard: React.FC<TransportWizardProps> = ({
  open,
  onOpenChange,
  existingTransport,
  onSaved,
}) => {
  const { t } = useTranslation()
  const upsertTransport = useConfigStore((s) => s.upsertTransport)
  const isTransportNameUnique = useConfigStore((s) => s.isTransportNameUnique)
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const transportNames = useTransportNames()
  const isEdit = !!existingTransport

  // ─── Form state ──────────────────────────────────────────────────
  const [selectedType, setSelectedType] = useState<TransportType | null>(
    (existingTransport?.type as TransportType) ?? null,
  )
  const [transportName, setTransportName] = useState(existingTransport?.name ?? '')
  const [settings, setSettings] = useState<Record<string, unknown>>(
    existingTransport?.settings ?? {},
  )
  // Toplevel fields (batch-size, flush-interval, etc.)
  const [toplevel, setToplevel] = useState<Record<string, unknown>>(() => {
    const tl: Record<string, unknown> = {}
    if (existingTransport) {
      const tp = existingTransport as unknown as Record<string, unknown>
      for (const f of TRANSPORT_TOPLEVEL_FIELDS) {
        const val = tp[f.key]
        if (val !== undefined) tl[f.key] = val
      }
    }
    return tl
  })
  const [currentStep, setCurrentStep] = useState(0)

  // Reset on open
  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setSelectedType((existingTransport?.type as TransportType) ?? null)
    setTransportName(existingTransport?.name ?? '')
    setSettings(existingTransport?.settings ?? {})
    const tl: Record<string, unknown> = {}
    if (existingTransport) {
      const tp = existingTransport as unknown as Record<string, unknown>
      for (const f of TRANSPORT_TOPLEVEL_FIELDS) {
        const val = tp[f.key]
        if (val !== undefined) tl[f.key] = val
      }
    }
    setToplevel(tl)
    setCurrentStep(0)
  }
  if (!open && lastOpen) setLastOpen(false)

  // Registry lookup
  const registry = useMemo(
    () => (selectedType ? getTransportFieldRegistry(selectedType) : undefined),
    [selectedType],
  )

  // When type changes (create mode), reset settings to defaults
  const [lastType, setLastType] = useState(selectedType)
  if (selectedType !== lastType) {
    setLastType(selectedType)
    if (!isEdit && registry) {
      setSettings(buildDefaultSettings(registry))
    }
  }

  // ─── Preview YAML ────────────────────────────────────────────────
  const previewYaml = useMemo(() => {
    if (!selectedType) return ''
    const config: TransportConfig = {
      name: transportName || '<transport-name>',
      type: selectedType,
      settings,
      ...(toplevel['batch-size'] !== undefined
        ? { 'batch-size': toplevel['batch-size'] as number }
        : {}),
      ...(toplevel['flush-interval'] !== undefined
        ? { 'flush-interval': toplevel['flush-interval'] as string }
        : {}),
      ...(toplevel['retry-count'] !== undefined
        ? { 'retry-count': toplevel['retry-count'] as number }
        : {}),
      ...(toplevel['buffer-size'] !== undefined
        ? { 'buffer-size': toplevel['buffer-size'] as number }
        : {}),
      ...(toplevel.fallback ? { fallback: toplevel.fallback as string } : {}),
    }
    return dumpConfigYaml({ transports: [config] })
  }, [selectedType, transportName, settings, toplevel])

  // ─── Context validation ──────────────────────────────────────────
  const contextValidation = useMemo(() => {
    if (!selectedType || !transportName.trim()) return null
    const config: TransportConfig = {
      name: transportName.trim(),
      type: selectedType,
      settings,
      ...(toplevel['batch-size'] !== undefined
        ? { 'batch-size': toplevel['batch-size'] as number }
        : {}),
      ...(toplevel['flush-interval'] !== undefined
        ? { 'flush-interval': toplevel['flush-interval'] as string }
        : {}),
      ...(toplevel['retry-count'] !== undefined
        ? { 'retry-count': toplevel['retry-count'] as number }
        : {}),
      ...(toplevel['buffer-size'] !== undefined
        ? { 'buffer-size': toplevel['buffer-size'] as number }
        : {}),
      ...(toplevel.fallback ? { fallback: toplevel.fallback as string } : {}),
    }
    return validateTransportInContext(workingConfig, config)
  }, [selectedType, transportName, settings, toplevel, workingConfig])

  const hasContextErrors = contextValidation !== null && !contextValidation.valid

  // ─── Step validation gates ───────────────────────────────────────
  const step0Valid = selectedType !== null
  const step1Valid = useMemo(() => {
    if (!selectedType || !transportName.trim()) return false
    if (!isEdit && !isTransportNameUnique(transportName.trim())) return false
    if (registry) {
      for (const group of registry.groups) {
        for (const field of group.fields) {
          if (field.required) {
            const val = settings[field.key]
            if (val === undefined || val === null || val === '') return false
          }
        }
      }
    }
    return true
  }, [selectedType, transportName, settings, registry, isEdit, isTransportNameUnique])

  // ─── Save ────────────────────────────────────────────────────────
  const handleFinish = () => {
    if (!selectedType || !transportName.trim()) return
    const transport: TransportConfig = {
      name: transportName.trim(),
      type: selectedType,
      settings,
      ...(toplevel['batch-size'] !== undefined
        ? { 'batch-size': toplevel['batch-size'] as number }
        : {}),
      ...(toplevel['flush-interval'] !== undefined
        ? { 'flush-interval': toplevel['flush-interval'] as string }
        : {}),
      ...(toplevel['retry-count'] !== undefined
        ? { 'retry-count': toplevel['retry-count'] as number }
        : {}),
      ...(toplevel['buffer-size'] !== undefined
        ? { 'buffer-size': toplevel['buffer-size'] as number }
        : {}),
      ...(toplevel.fallback ? { fallback: toplevel.fallback as string } : {}),
    }
    const ok = upsertTransport(transport)
    if (ok) {
      onOpenChange(false)
      onSaved?.()
    }
  }

  // ─── Build wizard steps ──────────────────────────────────────────
  const steps: WizardStep[] = [
    {
      id: 'type',
      title: t('transportWizard.stepType'),
      subtitle: t('transportWizard.stepTypeDesc'),
      canProceed: () => step0Valid,
      render: () => (
        <div className="space-y-3">
          {isEdit && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
              {t('transportWizard.typeLockedInEdit')}
            </div>
          )}
          <RadioGroup
            value={selectedType ?? ''}
            onValueChange={(v) => !isEdit && setSelectedType(v as TransportType)}
            className="grid grid-cols-2 gap-3"
          >
            {TRANSPORT_TYPE_META.map((meta) => (
              <label
                key={meta.type}
                htmlFor={`ttype-${meta.type}`}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border p-4 cursor-pointer transition-all',
                  selectedType === meta.type
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40 hover:bg-accent/30',
                  isEdit && meta.type !== selectedType && 'opacity-40 pointer-events-none',
                )}
              >
                <RadioGroupItem value={meta.type} id={`ttype-${meta.type}`} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-primary">{meta.icon}</span>
                    <span className="text-sm font-medium">{meta.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>
      ),
    },
    {
      id: 'connection',
      title: t('transportWizard.stepConnection'),
      subtitle: t('transportWizard.stepConnectionDesc'),
      canProceed: () => step1Valid,
      render: () => (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              {t('transportWizard.transportName')}
              <span className="text-destructive"> *</span>
            </Label>
            <Input
              value={transportName}
              onChange={(e) => setTransportName(e.target.value)}
              placeholder="cloud-mqtt"
              disabled={isEdit}
            />
            {!isEdit && transportName && !isTransportNameUnique(transportName) && (
              <p className="text-xs text-destructive">{t('transportWizard.nameExists')}</p>
            )}
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                {t('transportWizard.nameLockedInEdit')}
              </p>
            )}
          </div>

          {registry && (
            <div className="space-y-3">
              {registry.groups.map((group, gi) => (
                <div key={gi} className={cn('space-y-2.5', group.advanced && 'pt-2 border-t')}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t(group.label)}
                    </span>
                    {group.advanced && (
                      <span className="text-[10px] text-muted-foreground/60">
                        ({t('wizard.optional')})
                      </span>
                    )}
                  </div>
                  <RegistryFieldGrid
                    fields={group.fields}
                    settings={settings}
                    onChange={(key, val) => setSettings((prev) => ({ ...prev, [key]: val }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'publishing',
      title: t('transportWizard.stepPublishing'),
      subtitle: t('transportWizard.stepPublishingDesc'),
      render: () => (
        <div className="space-y-3">
          <RegistryFieldGrid
            fields={TRANSPORT_TOPLEVEL_FIELDS}
            settings={toplevel}
            onChange={(key, val) => setToplevel((prev) => ({ ...prev, [key]: val }))}
            transportNames={transportNames}
            currentName={transportName}
          />
        </div>
      ),
    },
    {
      id: 'preview',
      title: t('transportWizard.stepPreview'),
      subtitle: t('transportWizard.stepPreviewDesc'),
      render: () => (
        <div className="space-y-2">
          <div className="rounded-md border bg-muted/20 overflow-auto max-h-[200px]">
            <pre className="text-xs font-mono p-3 leading-relaxed">{previewYaml}</pre>
          </div>
          {contextValidation && (
            <div
              className={`rounded-md border p-2.5 text-xs space-y-1 ${
                hasContextErrors
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {hasContextErrors ? (
                <>
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t('driverWizard.validationErrors', {
                      count: contextValidation.errors.length,
                    })}
                  </div>
                  <ul className="space-y-0.5 ml-5 list-disc">
                    {contextValidation.errors.slice(0, 6).map((err, i) => (
                      <li key={i} className="font-mono text-[10px] opacity-90">
                        {err.path}: {err.message}
                      </li>
                    ))}
                    {contextValidation.errors.length > 6 && (
                      <li className="text-[9px] opacity-70">
                        {t('driverWizard.validationMore', {
                          count: contextValidation.errors.length - 6,
                        })}
                      </li>
                    )}
                  </ul>
                </>
              ) : (
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('driverWizard.validationPassed')}
                </div>
              )}
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      steps={steps}
      current={currentStep}
      onNext={(idx) => setCurrentStep(idx)}
      onPrevious={(idx) => setCurrentStep(idx)}
      onFinish={handleFinish}
      canFinish={!hasContextErrors}
      onCancel={() => onOpenChange(false)}
      dialogTitle={isEdit ? t('transportWizard.editTitle') : t('transportWizard.createTitle')}
      previewNode={
        <pre className="text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
          {previewYaml}
        </pre>
      }
    />
  )
}

// ─── Registry field grid (shared with DriverWizard pattern) ──────────

const RegistryFieldGrid: React.FC<{
  fields: SettingsField[]
  settings: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  transportNames?: string[]
  currentName?: string
}> = ({ fields, settings, onChange, transportNames, currentName }) => {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {fields.map((field) => (
        <RegistryFieldInput
          key={field.key}
          field={field}
          value={settings[field.key]}
          onChange={(v) => onChange(field.key, v)}
          transportNames={transportNames}
          currentName={currentName}
        />
      ))}
    </div>
  )
}

const RegistryFieldInput: React.FC<{
  field: SettingsField
  value: unknown
  onChange: (value: unknown) => void
  transportNames?: string[]
  currentName?: string
}> = ({ field, value, onChange, transportNames, currentName }) => {
  const { t } = useTranslation()
  const label = t(field.label)
  const help = field.help ? t(field.help) : undefined
  const placeholder = field.placeholder ?? ''

  const renderControl = () => {
    // Dynamic select (e.g. fallback transport list)
    if (field.type === 'select' && field.optionsSource === 'transports') {
      const options = (transportNames ?? []).filter((n) => n !== currentName)
      return (
        <Select
          value={value !== undefined && value !== null ? String(value) : undefined}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={placeholder || t('common.none')} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    switch (field.type) {
      case 'text':
      case 'duration':
        return (
          <Input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-xs"
          />
        )
      case 'number':
        return (
          <Input
            type="number"
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(e) => {
              const v = e.target.value
              onChange(v === '' ? undefined : Number(v))
            }}
            placeholder={placeholder}
            min={field.min}
            max={field.max}
            className="h-8 text-xs"
          />
        )
      case 'password':
        return (
          <Input
            type="password"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-xs"
          />
        )
      case 'boolean':
        return (
          <Select value={value ? 'true' : 'false'} onValueChange={(v) => onChange(v === 'true')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{t('common.enabled')}</SelectItem>
              <SelectItem value="false">{t('common.disabled')}</SelectItem>
            </SelectContent>
          </Select>
        )
      case 'enum':
        return (
          <Select
            value={value !== undefined && value !== null ? String(value) : undefined}
            onValueChange={(v) => {
              if (typeof field.default === 'number') onChange(Number(v))
              else onChange(v)
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={placeholder || t('common.select')} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt} value={opt} className="text-xs">
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium leading-none flex items-center gap-0.5">
        {label}
        {field.required && <span className="text-destructive">*</span>}
      </label>
      {renderControl()}
      {help && <p className="text-[10px] text-muted-foreground leading-tight">{help}</p>}
    </div>
  )
}
