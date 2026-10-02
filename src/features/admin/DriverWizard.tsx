/**
 * DriverWizard
 *
 * Multi-step wizard for creating or editing a driver configuration.
 * Implements the wizard-style interaction the user requested:
 *   Step 1 — Driver Type: choose protocol (modbus-tcp/rtu/tls/s7/opcua/...)
 *   Step 2 — Connection: driver name + connection settings (from registry)
 *   Step 3 — Tags: tag list editor (TagListField)
 *   Step 4 — Advanced: tags-file, tags-interval, reconnect backoff
 *   Step 5 — Preview & Save: YAML preview + validation → configStore.upsertDriver
 *
 * The wizard is a Dialog (modal) triggered from DriversPage. On finish,
 * it calls configStore.upsertDriver() which merges the new/edited driver
 * into the working config. The actual PUT /configs happens separately
 * via ConfigApplyConfirmationDialog (safety gate).
 *
 * Edit mode: when `existingDriver` is provided, the form is pre-filled
 * with that driver's values and the type step is locked (changing type
 * would require a full recreate).
 *
 * Decision-independent: works under both backend paths because it only
 * interacts with configStore, not the API directly.
 */
import { FileText, Plus, Settings2, Trash2, Zap } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
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
import { RegistryFieldGrid } from '@/components/wizard/RegistryFieldGrid'
import { WizardDialog, type WizardStep } from '@/components/wizard/Wizard'
import { WizardContextValidationBanner } from '@/components/wizard/WizardContextValidationBanner'
import { cn } from '@/lib/cn'
import { dumpConfigYaml } from '@/lib/configYaml'
import { validateDriverInContext } from '@/lib/entityValidation'
import { buildDefaultSettings, getDriverFieldRegistry } from '@/lib/settingsRegistry'
import { useConfigStore } from '@/stores/configStore'
import { DATA_TYPES, type DriverConfig, type DriverType } from '@/types/config'

// ─── Driver type metadata for the selection grid ─────────────────────

interface DriverTypeMeta {
  type: DriverType
  label: string
  icon: React.ReactNode
  description: string
}

const DRIVER_TYPE_META: DriverTypeMeta[] = [
  {
    type: 'modbus-tcp',
    label: 'Modbus TCP',
    icon: <Zap className="h-5 w-5" />,
    description: 'PLC / sensor gateway over Ethernet',
  },
  {
    type: 'modbus-rtu',
    label: 'Modbus RTU',
    icon: <Zap className="h-5 w-5" />,
    description: 'Serial line (RS-485) sensor',
  },
  {
    type: 'modbus-rtuovertcp',
    label: 'Modbus RTU over TCP',
    icon: <Zap className="h-5 w-5" />,
    description: 'Serial-to-Ethernet gateway',
  },
  {
    type: 'modbus-udp',
    label: 'Modbus UDP',
    icon: <Zap className="h-5 w-5" />,
    description: 'Modbus TCP over UDP',
  },
  {
    type: 'modbus-rtuoverudp',
    label: 'Modbus RTU over UDP',
    icon: <Zap className="h-5 w-5" />,
    description: 'RTU framing over UDP',
  },
  {
    type: 'modbus-tls',
    label: 'Modbus TLS',
    icon: <Zap className="h-5 w-5" />,
    description: 'Encrypted Modbus (mTLS)',
  },
  {
    type: 's7',
    label: 'Siemens S7',
    icon: <Settings2 className="h-5 w-5" />,
    description: 'S7-300 / S7-1200 / S7-1500',
  },
  {
    type: 'opcua',
    label: 'OPC UA',
    icon: <FileText className="h-5 w-5" />,
    description: 'SCADA / MES OPC server',
  },
]

// ─── Component ───────────────────────────────────────────────────────

export interface DriverWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, the wizard edits this driver (type step locked). */
  existingDriver?: DriverConfig
  /** Called after the driver is upserted into configStore. */
  onSaved?: () => void
}

export const DriverWizard: React.FC<DriverWizardProps> = ({
  open,
  onOpenChange,
  existingDriver,
  onSaved,
}) => {
  const { t } = useTranslation()
  const upsertDriver = useConfigStore((s) => s.upsertDriver)
  const isDriverNameUnique = useConfigStore((s) => s.isDriverNameUnique)
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const isEdit = !!existingDriver

  // ─── Form state ──────────────────────────────────────────────────
  // We use a plain useForm (not zodResolver) because the per-type settings
  // validation is conditional and complex — the Wizard's canProceed gates
  // handle step-level validation, and the final configStore + configSchema
  // validateFullConfig handles the full check.
  const [selectedType, setSelectedType] = useState<DriverType | null>(
    (existingDriver?.type as DriverType) ?? null,
  )
  const [driverName, setDriverName] = useState(existingDriver?.name ?? '')
  const [settings, setSettings] = useState<Record<string, unknown>>(existingDriver?.settings ?? {})
  const [tags, setTags] = useState(existingDriver?.tags ?? [])
  const [tagsFile, setTagsFile] = useState(existingDriver?.['tags-file'] ?? '')
  const [tagsInterval, setTagsInterval] = useState(existingDriver?.['tags-interval'] ?? '')
  const [currentStep, setCurrentStep] = useState(0)

  // Reset state when the dialog opens (especially for re-entry after close).
  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setSelectedType((existingDriver?.type as DriverType) ?? null)
    setDriverName(existingDriver?.name ?? '')
    setSettings(existingDriver?.settings ?? {})
    setTags(existingDriver?.tags ?? [])
    setTagsFile(existingDriver?.['tags-file'] ?? '')
    setTagsInterval(existingDriver?.['tags-interval'] ?? '')
    setCurrentStep(0)
  }
  if (!open && lastOpen) {
    setLastOpen(false)
  }

  // ─── Registry lookup ─────────────────────────────────────────────
  const registry = useMemo(
    () => (selectedType ? getDriverFieldRegistry(selectedType) : undefined),
    [selectedType],
  )

  // When type changes (create mode), reset settings to defaults.
  const [lastType, setLastType] = useState(selectedType)
  if (selectedType !== lastType) {
    setLastType(selectedType)
    if (!isEdit) {
      setSettings(buildDefaultSettings(registry))
    }
  }

  // ─── Preview YAML ────────────────────────────────────────────────
  const previewYaml = useMemo(() => {
    if (!selectedType) return ''
    const config: DriverConfig = {
      name: driverName || '<driver-name>',
      type: selectedType,
      settings,
      tags,
      ...(tagsFile ? { 'tags-file': tagsFile } : {}),
      ...(tagsInterval ? { 'tags-interval': tagsInterval } : {}),
    }
    return dumpConfigYaml({ drivers: [config] })
  }, [selectedType, driverName, settings, tags, tagsFile, tagsInterval])

  // ─── Context validation ──────────────────────────────────────────
  // Validates the driver merged into the full working config to catch
  // cross-entity issues (duplicate names, missing transports, etc.).
  const contextValidation = useMemo(() => {
    if (!selectedType || !driverName.trim()) return null
    const driver: DriverConfig = {
      name: driverName.trim(),
      type: selectedType,
      settings,
      tags,
      ...(tagsFile.trim() ? { 'tags-file': tagsFile.trim() } : {}),
      ...(tagsInterval.trim() ? { 'tags-interval': tagsInterval.trim() } : {}),
    }
    return validateDriverInContext(workingConfig, driver)
  }, [selectedType, driverName, settings, tags, tagsFile, tagsInterval, workingConfig])

  const hasContextErrors = contextValidation !== null && !contextValidation.valid

  // ─── Step validation gates ───────────────────────────────────────

  const step0Valid = selectedType !== null
  const step1Valid = useMemo(() => {
    if (!selectedType || !driverName.trim()) return false
    // Name uniqueness (allow same name in edit mode).
    if (!isEdit && !isDriverNameUnique(driverName.trim())) return false
    // Check required settings fields.
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
  }, [selectedType, driverName, settings, registry, isEdit, isDriverNameUnique])

  const step2Valid = tags.length > 0 || !!tagsFile.trim()

  // ─── Save ────────────────────────────────────────────────────────

  const handleFinish = () => {
    if (!selectedType || !driverName.trim()) return
    const driver: DriverConfig = {
      name: driverName.trim(),
      type: selectedType,
      settings,
      tags,
      ...(tagsFile.trim() ? { 'tags-file': tagsFile.trim() } : {}),
      ...(tagsInterval.trim() ? { 'tags-interval': tagsInterval.trim() } : {}),
    }
    const ok = upsertDriver(driver)
    if (ok) {
      onOpenChange(false)
      onSaved?.()
    }
  }

  // ─── Build wizard steps ──────────────────────────────────────────

  const steps: WizardStep[] = [
    {
      id: 'type',
      title: t('driverWizard.stepType'),
      subtitle: t('driverWizard.stepTypeDesc'),
      canProceed: () => step0Valid,
      render: () => (
        <div className="space-y-3">
          {isEdit && (
            <div className="rounded-md border border-status-warning/30 bg-status-warning/10 p-2 text-xs text-status-warning dark:text-status-warning">
              {t('driverWizard.typeLockedInEdit')}
            </div>
          )}
          <RadioGroup
            value={selectedType ?? ''}
            onValueChange={(v) => !isEdit && setSelectedType(v as DriverType)}
            className="grid grid-cols-2 gap-2"
          >
            {DRIVER_TYPE_META.map((meta) => (
              <label
                key={meta.type}
                htmlFor={`dtype-${meta.type}`}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-all',
                  selectedType === meta.type
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40 hover:bg-accent/30',
                  isEdit && meta.type !== selectedType && 'opacity-40 pointer-events-none',
                )}
              >
                <RadioGroupItem value={meta.type} id={`dtype-${meta.type}`} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-primary">{meta.icon}</span>
                    <span className="text-sm font-medium">{meta.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>
      ),
    },
    {
      id: 'connection',
      title: t('driverWizard.stepConnection'),
      subtitle: t('driverWizard.stepConnectionDesc'),
      canProceed: () => step1Valid,
      render: () => (
        <div className="space-y-4">
          {/* Driver name */}
          <div className="space-y-1.5">
            <Label>
              {t('driverWizard.driverName')}
              <span className="text-destructive"> *</span>
            </Label>
            <Input
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="plc-modbus"
              disabled={isEdit}
            />
            {!isEdit && driverName && !isDriverNameUnique(driverName) && (
              <p className="text-xs text-destructive">{t('driverWizard.nameExists')}</p>
            )}
            {isEdit && (
              <p className="text-xs text-muted-foreground">{t('driverWizard.nameLockedInEdit')}</p>
            )}
          </div>

          {/* Settings fields from registry */}
          {registry && (
            <div className="space-y-3">
              {registry.groups.map((group, gi) => (
                <div key={gi} className={cn('space-y-2.5', group.advanced && 'pt-2 border-t')}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t(group.label)}
                    </span>
                    {group.advanced && (
                      <span className="text-xs text-muted-foreground/60">
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
      id: 'tags',
      title: t('driverWizard.stepTags'),
      subtitle: t('driverWizard.stepTagsDesc'),
      canProceed: () => step2Valid,
      render: () => (
        <div className="space-y-3">
          <TagListEditor tags={tags} onChange={setTags} required={true} />
        </div>
      ),
    },
    {
      id: 'advanced',
      title: t('driverWizard.stepAdvanced'),
      subtitle: t('driverWizard.stepAdvancedDesc'),
      render: () => (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('driverWizard.tagsFile')}</Label>
            <Input
              value={tagsFile}
              onChange={(e) => setTagsFile(e.target.value)}
              placeholder="./tags/plc-modbus-tags.yaml"
            />
            <p className="text-xs text-muted-foreground">{t('driverWizard.tagsFileHelp')}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('driverWizard.tagsInterval')}</Label>
            <Input
              value={tagsInterval}
              onChange={(e) => setTagsInterval(e.target.value)}
              placeholder="30s"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">{t('driverWizard.tagsIntervalHelp')}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'preview',
      title: t('driverWizard.stepPreview'),
      subtitle: t('driverWizard.stepPreviewDesc'),
      render: () => (
        <div className="space-y-2">
          <div className="rounded-md border bg-muted/20 overflow-auto max-h-[200px]">
            <pre className="text-xs font-mono p-3 leading-relaxed">{previewYaml}</pre>
          </div>
          {contextValidation && (
            <WizardContextValidationBanner contextValidation={contextValidation} />
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
      dialogTitle={isEdit ? t('driverWizard.editTitle') : t('driverWizard.createTitle')}
      previewNode={
        <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
          {previewYaml}
        </pre>
      }
    />
  )
}

// ─── Tag list editor (inline adapter for wizard) ─────────────────────
// Wraps TagListField's logic but uses plain state instead of useForm context.

const TagListEditor: React.FC<{
  tags: DriverConfig['tags']
  onChange: (tags: DriverConfig['tags']) => void
  required: boolean
}> = ({ tags, onChange, required }) => {
  const { t } = useTranslation()

  const addTag = () => {
    onChange([...tags, { name: '', address: '', type: 'float32', interval: '1s' }])
  }

  const removeTag = (idx: number) => {
    onChange(tags.filter((_, i) => i !== idx))
  }

  const updateTag = (idx: number, key: string, value: unknown) => {
    onChange(tags.map((tag, i) => (i === idx ? { ...tag, [key]: value } : tag)))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {t('wizard.tags')}
          {required && <span className="text-destructive"> *</span>}
        </label>
        <Button type="button" variant="outline" size="sm" onClick={addTag} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" />
          {t('wizard.addTag')}
        </Button>
      </div>

      {tags.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          {t('wizard.noTags')}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_100px_1fr_90px_36px] gap-2 bg-muted/60 border-b px-3 py-1.5 text-xs uppercase font-semibold text-muted-foreground">
            <span>{t('common.name')} *</span>
            <span>{t('wizard.address')} *</span>
            <span>{t('wizard.type')} *</span>
            <span>{t('wizard.group')}</span>
            <span>{t('wizard.interval')}</span>
            <span />
          </div>
          {tags.map((tag, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_1fr_100px_1fr_90px_36px] gap-2 px-3 py-1.5 items-center border-b last:border-b-0 hover:bg-muted/20"
            >
              <Input
                value={tag.name}
                onChange={(e) => updateTag(idx, 'name', e.target.value)}
                placeholder="temperature"
                className="h-7 text-xs"
              />
              <Input
                value={tag.address}
                onChange={(e) => updateTag(idx, 'address', e.target.value)}
                placeholder="40001"
                className="h-7 text-xs font-mono"
              />
              <Select value={tag.type} onValueChange={(v) => updateTag(idx, 'type', v)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((dt) => (
                    <SelectItem key={dt} value={dt} className="text-xs font-mono">
                      {dt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={tag.group ?? ''}
                onChange={(e) => updateTag(idx, 'group', e.target.value)}
                placeholder="sensors"
                className="h-7 text-xs"
              />
              <Input
                value={tag.interval ?? ''}
                onChange={(e) => updateTag(idx, 'interval', e.target.value)}
                placeholder="1s"
                className="h-7 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => removeTag(idx)}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive justify-self-end"
                title={t('common.delete')}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {required && tags.length === 0 && (
        <p className="text-xs text-destructive">{t('wizard.tagsRequired')}</p>
      )}
    </div>
  )
}
