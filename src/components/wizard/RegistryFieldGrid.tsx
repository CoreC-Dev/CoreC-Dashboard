/**
 * RegistryFieldGrid
 *
 * Shared grid + per-field input renderer for settings-registry fields.
 * Extracted from DriverWizard/TransportWizard (the TransportWizard copy
 * was a strict superset — it adds the transports-select branch gated on
 * `transportNames`).
 *
 * The wizard manages state with useState (not useForm) because the dynamic
 * per-type field set makes a static zod schema impractical. This grid
 * renders fields directly bound to the settings state.
 */

import type { TFunction } from 'i18next'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TopicTemplatePreview } from '@/components/wizard/TopicTemplatePreview'
import type { SettingsField } from '@/lib/settingsRegistry'

/**
 * D-23 guard: registry fields reference i18n keys by raw string, and a key
 * pointing at the wrong (or a non-existent) namespace renders the literal
 * key as the help text — e.g. "settings.tagsFileHelp" shown to operators
 * because the copy actually lives at driverWizard.tagsFileHelp. Registry
 * key existence is asserted by settingsRegistry.test.ts, but the grid is
 * the last line of defense: in DEV it warns on the first render so the
 * slip is caught immediately, not in production copy.
 *
 * Detection uses t()'s own missing-key behavior (i18next returns the key
 * unchanged) rather than i18n.exists() — consumers may render with the
 * react-i18next default (uninitialized) instance, which has no exists().
 */
function translateFieldHelp(t: TFunction, key: string): string {
  const translated = t(key)
  if (import.meta.env.DEV && translated === key) {
    console.warn(`[settingsRegistry] field help key missing from the language packs: ${key}`)
  }
  return translated
}

export const RegistryFieldGrid: React.FC<{
  fields: SettingsField[]
  settings: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  transportNames?: string[]
  currentName?: string
}> = ({ fields, settings, onChange, transportNames, currentName }) => {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {fields.map((field) => {
        // Composite 'object' field: render sub-fields as a full-width sub-grid.
        if (field.type === 'object' && field.subFields) {
          const objValue = (settings[field.key] as Record<string, unknown> | undefined) ?? {}
          return (
            <div key={field.key} className="col-span-2 space-y-2">
              <label className="text-xs font-medium leading-none">{t(field.label)}</label>
              <div className="rounded-lg border border-border bg-muted/10 p-3">
                <RegistryFieldGrid
                  fields={field.subFields}
                  settings={objValue}
                  onChange={(subKey, subVal) =>
                    onChange(field.key, { ...objValue, [subKey]: subVal })
                  }
                  transportNames={transportNames}
                  currentName={currentName}
                />
              </div>
              {field.help && (
                <p className="text-xs text-muted-foreground leading-tight">
                  {translateFieldHelp(t, field.help)}
                </p>
              )}
            </div>
          )
        }
        return (
          <RegistryFieldInput
            key={field.key}
            field={field}
            value={settings[field.key]}
            onChange={(v) => onChange(field.key, v)}
            transportNames={transportNames}
            currentName={currentName}
          />
        )
      })}
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
  const help = field.help ? translateFieldHelp(t, field.help) : undefined
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
      <label className="text-xs font-medium leading-none flex items-center gap-0.5">
        {label}
        {field.required && <span className="text-destructive">*</span>}
      </label>
      {renderControl()}
      {help && <p className="text-xs text-muted-foreground leading-tight">{help}</p>}
      {field.key === 'topic-template' && (
        <TopicTemplatePreview value={(value as string) ?? ''} onChange={(v) => onChange(v)} />
      )}
    </div>
  )
}
