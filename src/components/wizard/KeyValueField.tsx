/**
 * KeyValueField
 *
 * Composite editor for map[string]string settings fields (e.g. HTTP transport
 * `headers`). Renders a dynamic list of key-value pair rows with add/remove
 * controls. The value is a plain JS object `{ [key]: value }` — when dumped
 * to YAML via js-yaml, it serializes as a YAML mapping, matching CoreC's
 * `map[string]any` expectation.
 *
 * Empty keys are filtered out on blur/change so the user doesn't accidentally
 * create `{ "": "value" }` entries.
 */
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface KeyValueFieldProps {
  /** Current value as a plain object (Record<string, string>). */
  value: unknown
  /** Called with the updated object whenever a pair changes. */
  onChange: (value: Record<string, string>) => void
  /** Placeholder for the key input. */
  keyPlaceholder?: string
  /** Placeholder for the value input. */
  valuePlaceholder?: string
}

/** Converts the unknown value to a clean Record<string, string>. */
export function toRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k) result[k] = String(v ?? '')
  }
  return result
}

export const KeyValueField: React.FC<KeyValueFieldProps> = ({
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}) => {
  const { t } = useTranslation()
  const entries = Object.entries(toRecord(value))

  const updateEntry = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...entries]
    if (field === 'key') {
      updated[index] = [newValue, updated[index][1]]
    } else {
      updated[index] = [updated[index][0], newValue]
    }
    // Rebuild the object, filtering out empty keys
    const result: Record<string, string> = {}
    for (const [k, v] of updated) {
      if (k) result[k] = v
    }
    onChange(result)
  }

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index)
    const result: Record<string, string> = {}
    for (const [k, v] of updated) {
      if (k) result[k] = v
    }
    onChange(result)
  }

  const addEntry = () => {
    // Add an empty entry — the user fills in the key
    const result = toRecord(value)
    // Use a temporary unique key that the user will replace
    let tempKey = ''
    let i = 0
    while (result[`key${i}`] !== undefined) i++
    tempKey = `key${i}`
    result[tempKey] = ''
    onChange(result)
  }

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          {t('settings.noEntries') || 'No entries. Click add to create one.'}
        </p>
      )}
      {entries.map(([key, val], index) => (
        <div key={`entry-${index}`} className="flex items-center gap-2">
          <Input
            type="text"
            value={key.startsWith('key') && val === '' ? '' : key}
            onChange={(e) => updateEntry(index, 'key', e.target.value)}
            placeholder={keyPlaceholder || t('settings.key') || 'Key'}
            className="h-8 text-xs flex-1"
          />
          <span className="text-muted-foreground text-xs">:</span>
          <Input
            type="text"
            value={val}
            onChange={(e) => updateEntry(index, 'value', e.target.value)}
            placeholder={valuePlaceholder || t('settings.value') || 'Value'}
            className="h-8 text-xs flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => removeEntry(index)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addEntry}>
        <Plus className="h-3 w-3 mr-1" />
        {t('settings.addEntry') || 'Add Entry'}
      </Button>
    </div>
  )
}
