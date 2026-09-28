/**
 * KeyValueField
 *
 * Composite editor for map[string]string settings fields (e.g. HTTP transport
 * `headers`). Renders a dynamic list of key-value pair rows with add/remove
 * controls. The value is a plain JS object `{ [key]: value }` — when dumped
 * to YAML via js-yaml, it serializes as a YAML mapping, matching CoreC's
 * `map[string]any` expectation.
 *
 * Empty keys are kept visible locally during editing but filtered out of the
 * propagated record so the user doesn't accidentally create `{ "": "value" }`
 * entries.
 */
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  // Local editing state keeps rows alive even when a key is transiently
  // empty. Previously `entries` was derived from `value` on every render, so
  // clearing a key (select-all → Delete, or backspacing to empty) rebuilt the
  // object with the entry filtered out — the row vanished mid-edit and the
  // value was silently lost. [H-4]
  //
  // We keep a local list and sync from the parent ONLY when the incoming
  // `value` differs from what we last emitted (i.e. an external reset / form
  // load), not when it's our own onChange echoing back. This removes the need
  // for a blur-based `editing` flag, which caused rows with empty keys to
  // vanish when focus moved between the key and value inputs of a row.
  const [entries, setEntries] = useState<[string, string][]>(() => Object.entries(toRecord(value)))
  const lastEmittedRef = useRef<Record<string, string> | null>(null)

  useEffect(() => {
    // Skip our own echo: if the parent value matches what we just propagated,
    // don't rebuild entries (would drop empty-key rows still being edited).
    if (lastEmittedRef.current !== null) {
      const incoming = toRecord(value)
      const emitted = lastEmittedRef.current
      const incomingKeys = Object.keys(incoming)
      const emittedKeys = Object.keys(emitted)
      if (
        incomingKeys.length === emittedKeys.length &&
        incomingKeys.every((k) => incoming[k] === emitted[k])
      ) {
        return
      }
    }
    setEntries(Object.entries(toRecord(value)))
  }, [value])

  const propagate = (next: [string, string][]) => {
    const result: Record<string, string> = {}
    for (const [k, v] of next) if (k) result[k] = v
    lastEmittedRef.current = result
    onChange(result)
  }

  const updateEntry = (index: number, field: 'key' | 'value', newValue: string) => {
    const next = [...entries]
    next[index] = field === 'key' ? [newValue, next[index][1]] : [next[index][0], newValue]
    setEntries(next)
    propagate(next)
  }

  const removeEntry = (index: number) => {
    const next: [string, string][] = entries.filter((_, i) => i !== index)
    setEntries(next)
    propagate(next)
  }

  const addEntry = () => {
    // Add an empty-key row; the user fills in the key. The empty key is
    // kept locally (visible) but filtered out of the propagated record.
    const next: [string, string][] = [...entries, ['', '']]
    setEntries(next)
    propagate(next)
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
            value={key}
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
