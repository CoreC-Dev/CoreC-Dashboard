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
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DriverConnectionTest } from '@/components/admin/DriverConnectionTest'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { RegistryFieldGrid } from '@/components/wizard/RegistryFieldGrid'
import { WizardDialog, type WizardStep } from '@/components/wizard/Wizard'
import { WizardContextValidationBanner } from '@/components/wizard/WizardContextValidationBanner'
import { TagListEditor } from '@/features/admin/driverWizard/TagListEditor'
import { DRIVER_TYPE_META } from '@/features/admin/driverWizard/typeMeta'
import { useResetOnOpen } from '@/hooks/useResetOnOpen'
import { cn } from '@/lib/cn'
import { dumpConfigYaml } from '@/lib/configYaml'
import { validateDriverInContext } from '@/lib/entityValidation'
import { buildDefaultSettings, getDriverFieldRegistry } from '@/lib/settingsRegistry'
import { isDriverDraftDirty } from '@/lib/wizardDirty'
import { missingRequiredSettingLabels } from '@/lib/wizardGate'
import { useConfigStore } from '@/stores/configStore'
import type { DriverConfig, DriverType } from '@/types/config'

// ─── Driver type metadata for the selection grid ─────────────────────

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
  const { t, i18n: i18nInst } = useTranslation()
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
  useResetOnOpen(open, () => {
    setSelectedType((existingDriver?.type as DriverType) ?? null)
    setDriverName(existingDriver?.name ?? '')
    setSettings(existingDriver?.settings ?? {})
    setTags(existingDriver?.tags ?? [])
    setTagsFile(existingDriver?.['tags-file'] ?? '')
    setTagsInterval(existingDriver?.['tags-interval'] ?? '')
    setCurrentStep(0)
  })

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

  // C-A5: a concrete reason instead of the generic "fix the errors
  // first" — the hint names the exact missing fields ("Missing
  // required: Host, Port"), locale-aware via Intl.ListFormat.
  const formatMissing = (fields: string[]): string =>
    new Intl.ListFormat(i18nInst.resolvedLanguage ?? 'en', { type: 'conjunction' }).format(fields)
  const step1Gate = (): boolean | { ok: false; reason: string } => {
    if (!selectedType) return true // unreachable past the type step
    const name = driverName.trim()
    if (name && !isEdit && !isDriverNameUnique(name)) {
      return { ok: false, reason: t('driverWizard.nameExists') }
    }
    const missing: string[] = []
    if (!name) missing.push(t('driverWizard.driverName'))
    missing.push(...missingRequiredSettingLabels(registry, settings).map((labelKey) => t(labelKey)))
    if (missing.length === 0) return true
    return { ok: false, reason: t('wizard.missingRequired', { fields: formatMissing(missing) }) }
  }

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
      canProceed: step1Gate,
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

          {/* Optional connectivity probe against the current type+settings.
              Purely auxiliary — it does not gate this step's canProceed. */}
          <DriverConnectionTest
            type={selectedType}
            settings={settings}
            name={driverName.trim() || undefined}
          />
        </div>
      ),
    },
    {
      id: 'tags',
      title: t('driverWizard.stepTags'),
      subtitle: t('driverWizard.stepTagsDesc'),
      canProceed: () =>
        step2Valid ? true : { ok: false as const, reason: t('wizard.tagsRequired') },
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
      // C-A2: a draft with unsaved input confirms before the wizard closes.
      isDirty={() =>
        isDriverDraftDirty({
          currentStep,
          isEdit,
          existing: existingDriver,
          selectedType,
          driverName,
          settings,
          tags,
          tagsFile,
          tagsInterval,
        })
      }
      dialogTitle={isEdit ? t('driverWizard.editTitle') : t('driverWizard.createTitle')}
      previewNode={
        <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
          {previewYaml}
        </pre>
      }
    />
  )
}
