/**
 * TagListField
 *
 * Composite editor for the `tags` array in a DriverConfig. Renders an
 * editable table where each row is a TagConfig (name/address/type/group/
 * interval/scale/offset/deadband/read-timeout).
 *
 * Uses react-hook-form's `useFieldArray` for array state management —
 * the form path is `tags` (relative to the driver form root).
 *
 * Design:
 *   - Compact table with inline editing (Input/Select per cell).
 *   - "Add Tag" button appends a new row with sensible defaults.
 *   - Each row has a delete button (trash icon).
 *   - Required fields (name, address, type) are visually marked.
 *   - Advanced fields (scale/offset/deadband/read-timeout) are in a
 *     collapsible "advanced" toggle per row, keeping the default view
 *     clean for the common case (name + address + type + interval).
 *
 * Validation (name uniqueness, valid type, etc.) is handled by the
 * zod schema in configSchema.ts — this component only renders inputs.
 */
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DATA_TYPES } from '@/types/config'

export interface TagListFieldProps {
  /** Form path to the tags array (default: "tags"). */
  name?: string
  /** Whether at least one tag is required (driver-level validation). */
  required?: boolean
}

const EMPTY_TAG = {
  name: '',
  address: '',
  type: 'float32' as const,
  group: '',
  interval: '1s',
}

export const TagListField: React.FC<TagListFieldProps> = ({ name = 'tags', required = false }) => {
  const { t } = useTranslation()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({ control, name })
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {t('wizard.tags')}
          {required && <span className="text-destructive"> *</span>}
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ ...EMPTY_TAG })}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          {t('wizard.addTag')}
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          {t('wizard.noTags')}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_100px_1fr_90px_36px] gap-2 bg-muted/60 border-b px-3 py-1.5 text-[10px] uppercase font-semibold text-muted-foreground">
            <span>{t('common.name')} *</span>
            <span>{t('wizard.address')} *</span>
            <span>{t('wizard.type')} *</span>
            <span>{t('wizard.group')}</span>
            <span>{t('wizard.interval')}</span>
            <span />
          </div>

          {/* Rows */}
          {fields.map((field, idx) => (
            <div key={field.id}>
              <TagRow
                index={idx}
                expanded={expandedRows.has(idx)}
                onToggle={() => toggleRow(idx)}
                onRemove={() => remove(idx)}
                canRemove={true}
              />
              {expandedRows.has(idx) && <TagAdvancedFields index={idx} />}
            </div>
          ))}
        </div>
      )}

      {required && fields.length === 0 && (
        <p className="text-xs text-destructive">{t('wizard.tagsRequired')}</p>
      )}
    </div>
  )
}

// ─── Single tag row (basic fields) ────────────────────────────────────

const TagRow: React.FC<{
  index: number
  expanded: boolean
  onToggle: () => void
  onRemove: () => void
  canRemove: boolean
}> = ({ index, expanded, onToggle, onRemove, canRemove }) => {
  const { t } = useTranslation()
  const { register } = useFormContext()

  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_1fr_100px_1fr_90px_36px] gap-2 px-3 py-1.5 items-center border-b last:border-b-0',
        'hover:bg-muted/20',
      )}
    >
      <Input
        {...register(`tags.${index}.name`)}
        placeholder="temperature"
        className="h-7 text-xs"
      />
      <Input
        {...register(`tags.${index}.address`)}
        placeholder="40001"
        className="h-7 text-xs font-mono"
      />
      <TagTypeSelect index={index} />
      <Input {...register(`tags.${index}.group`)} placeholder="sensors" className="h-7 text-xs" />
      <Input
        {...register(`tags.${index}.interval`)}
        placeholder="1s"
        className="h-7 text-xs font-mono"
      />
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
          title={expanded ? t('wizard.collapse') : t('wizard.expand')}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title={t('common.delete')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Tag type select ──────────────────────────────────────────────────

const TagTypeSelect: React.FC<{ index: number }> = ({ index }) => {
  const { watch, setValue } = useFormContext()
  const value = watch(`tags.${index}.type`) as string

  return (
    <Select value={value ?? 'float32'} onValueChange={(v) => setValue(`tags.${index}.type`, v)}>
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
  )
}

// ─── Advanced fields (scale/offset/deadband/read-timeout) ─────────────

const TagAdvancedFields: React.FC<{ index: number }> = ({ index }) => {
  const { t } = useTranslation()
  const { register } = useFormContext()

  return (
    <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-muted/10 border-b text-xs">
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground uppercase">{t('wizard.scale')}</label>
        <Input
          {...register(`tags.${index}.scale`, {
            setValueAs: (v) => {
              if (v === '' || v == null) return undefined
              const n = Number(v)
              return Number.isNaN(n) ? undefined : n
            },
          })}
          type="number"
          step="any"
          placeholder="1.0"
          className="h-7 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground uppercase">{t('wizard.offset')}</label>
        <Input
          {...register(`tags.${index}.offset`, {
            setValueAs: (v) => {
              if (v === '' || v == null) return undefined
              const n = Number(v)
              return Number.isNaN(n) ? undefined : n
            },
          })}
          type="number"
          step="any"
          placeholder="0"
          className="h-7 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground uppercase">
          {t('wizard.deadband')}
        </label>
        <Input
          {...register(`tags.${index}.deadband`, {
            setValueAs: (v) => {
              if (v === '' || v == null) return undefined
              const n = Number(v)
              return Number.isNaN(n) ? undefined : n
            },
          })}
          type="number"
          step="any"
          placeholder="0"
          className="h-7 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground uppercase">
          {t('wizard.readTimeout')}
        </label>
        <Input
          {...register(`tags.${index}.read-timeout`)}
          placeholder="500ms"
          className="h-7 text-xs font-mono"
        />
      </div>
    </div>
  )
}
