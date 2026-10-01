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
import type { SettingsField } from '@/lib/settingsRegistry'

export const RegistryFieldGrid: React.FC<{
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
      <label className="text-xs font-medium leading-none flex items-center gap-0.5">
        {label}
        {field.required && <span className="text-destructive">*</span>}
      </label>
      {renderControl()}
      {help && <p className="text-xs text-muted-foreground leading-tight">{help}</p>}
    </div>
  )
}
