/**
 * SettingsFieldRenderer
 *
 * Renders a list of SettingsField descriptors (from settingsRegistry.ts) as
 * react-hook-form FormFields, choosing the appropriate input control per
 * field type. This is the bridge between the declarative field registry and
 * the shadcn form primitives — the wizard pages never hand-write individual
 * field inputs; they pass a registry group's fields to this renderer.
 *
 * Conditional visibility: fields with `visibleWhen` are only rendered when
 * the referenced field's current value matches. Uses `useWatch` for
 * reactive re-evaluation.
 *
 * Dynamic options: fields with `type: 'select'` and `optionsSource` pull
 * their option list from the `optionsSources` prop (e.g. transport names
 * for the `fallback` field).
 */
import type React from 'react'
import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { KeyValueField } from '@/components/wizard/KeyValueField'
import type { SettingsField } from '@/lib/settingsRegistry'

export interface OptionsSources {
  /** Transport names for `fallback` / `target` select fields. */
  transports?: string[]
  /** Driver names (reserved for future use). */
  drivers?: string[]
}

export interface SettingsFieldRendererProps {
  /** Fields to render (typically one group's fields from the registry). */
  fields: SettingsField[]
  /** Form path prefix for these fields (e.g. "settings" or ""). */
  prefix?: string
  /** Dynamic option lists for `select` type fields. */
  optionsSources?: OptionsSources
}

export const SettingsFieldRenderer: React.FC<SettingsFieldRendererProps> = ({
  fields,
  prefix = 'settings',
  optionsSources,
}) => {
  const { t } = useTranslation()

  return (
    <>
      {fields.map((field) => (
        <ConditionalField
          key={field.key}
          field={field}
          prefix={prefix}
          optionsSources={optionsSources}
          t={t}
        />
      ))}
    </>
  )
}

// ─── Conditional wrapper ──────────────────────────────────────────────

const ConditionalField: React.FC<{
  field: SettingsField
  prefix: string
  optionsSources?: OptionsSources
  t: (key: string, opts?: Record<string, unknown>) => string
}> = ({ field, prefix, optionsSources, t }) => {
  // Evaluate visibleWhen condition reactively.
  const watchValue = useWatch({ name: `${prefix}.${field.visibleWhen?.field}` })

  if (field.visibleWhen) {
    const expected = field.visibleWhen.equals
    // For string comparisons, also handle the case where the watched value
    // is undefined (field not yet filled) — only show if it matches exactly.
    if (watchValue !== expected) return null
  }

  const path = prefix ? `${prefix}.${field.key}` : field.key
  const label = t(field.label)
  const help = field.help ? t(field.help) : undefined
  const requiredMark = field.required ? ' *' : ''

  return (
    <FormField
      name={path}
      render={({ field: formField }) => (
        <FormItem>
          <FormLabel>
            {label}
            {requiredMark && <span className="text-destructive">{requiredMark}</span>}
          </FormLabel>
          <FieldControl
            field={field}
            value={formField.value}
            onChange={formField.onChange}
            onBlur={formField.onBlur}
            optionsSources={optionsSources}
            t={t}
          />
          {help && <FormDescription>{help}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// ─── Individual control renderer ──────────────────────────────────────

const FieldControl: React.FC<{
  field: SettingsField
  value: unknown
  onChange: (value: unknown) => void
  onBlur: () => void
  optionsSources?: OptionsSources
  t: (key: string, opts?: Record<string, unknown>) => string
}> = ({ field, value, onChange, onBlur, optionsSources, t }) => {
  const placeholder = field.placeholder ?? ''

  switch (field.type) {
    case 'text':
    case 'duration':
      return (
        <Input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
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
          onBlur={onBlur}
          placeholder={placeholder}
          min={field.min}
          max={field.max}
        />
      )

    case 'password':
      return (
        <Input
          type="password"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
        />
      )

    case 'textarea':
      return (
        <Textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="min-h-[100px] font-mono text-xs"
        />
      )

    case 'key-value':
      return (
        <KeyValueField value={value} onChange={(v) => onChange(v)} keyPlaceholder={placeholder} />
      )

    case 'boolean':
      return (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(Boolean(checked))}
          />
          <span className="text-xs text-muted-foreground">
            {value ? t('common.enabled') : t('common.disabled')}
          </span>
        </div>
      )

    case 'enum':
      return (
        <Select
          value={value !== undefined && value !== null ? String(value) : undefined}
          onValueChange={(v) => {
            // Preserve numeric type if the original default was a number.
            if (typeof field.default === 'number') {
              onChange(Number(v))
            } else {
              onChange(v)
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder || t('common.select') || 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'select': {
      const options =
        field.optionsSource === 'transports'
          ? (optionsSources?.transports ?? [])
          : field.optionsSource === 'drivers'
            ? (optionsSources?.drivers ?? [])
            : (field.options ?? [])
      return (
        <Select value={(value as string) ?? undefined} onValueChange={(v) => onChange(v)}>
          <SelectTrigger>
            <SelectValue placeholder={placeholder || '—'} />
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 ? (
              <SelectItem value="__none" disabled>
                {t('common.none') || 'No options'}
              </SelectItem>
            ) : (
              options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )
    }

    default:
      return null
  }
}

// ─── RadioGroup variant (for small enum sets like parity, qos) ────────
// Exported for wizards that prefer radio buttons over a select dropdown
// when there are ≤3 options.
export const RadioEnumField: React.FC<{
  field: SettingsField
  prefix?: string
}> = ({ field, prefix = 'settings' }) => {
  const path = prefix ? `${prefix}.${field.key}` : field.key
  const { t } = useTranslation()
  const label = t(field.label)

  return (
    <FormField
      name={path}
      render={({ field: formField }) => (
        <FormItem>
          <FormLabel>
            {label}
            {field.required && <span className="text-destructive"> *</span>}
          </FormLabel>
          <RadioGroup
            value={formField.value !== undefined ? String(formField.value) : undefined}
            onValueChange={(v) => {
              if (typeof field.default === 'number') {
                formField.onChange(Number(v))
              } else {
                formField.onChange(v)
              }
            }}
            className="flex flex-wrap gap-3"
          >
            {field.options?.map((opt) => (
              <div key={opt} className="flex items-center gap-1.5">
                <RadioGroupItem value={opt} id={`${path}-${opt}`} />
                <label htmlFor={`${path}-${opt}`} className="text-xs cursor-pointer select-none">
                  {opt}
                </label>
              </div>
            ))}
          </RadioGroup>
          {field.help && <FormDescription>{t(field.help)}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
