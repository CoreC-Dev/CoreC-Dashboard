/**
 * components/admin/AssistantSettingsSection.tsx - the custom-AI form.
 *
 * Edits the provider records the assistant uses (lib/assistantStorage.ts)
 * and states, in the UI and not only in a doc, that the key lands in
 * localStorage in this browser. If that sentence ever stops being true the
 * storage module and this form must change together.
 */
import { Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AssistantProvider } from '@/types/assistant'

interface Props {
  providers: AssistantProvider[]
  selected: string | null
  onChange: (providers: AssistantProvider[], selected: string | null) => void
}

const BLANK: AssistantProvider = {
  name: '',
  baseUrl: '',
  model: '',
}

export const ProviderSettings: React.FC<Props> = ({ providers, selected, onChange }) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<AssistantProvider[]>(providers)

  const update = (idx: number, patch: Partial<AssistantProvider>) => {
    setDraft((list) => list.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const add = () => setDraft((list) => [...list, { ...BLANK }])

  const remove = (idx: number) => {
    setDraft((list) => {
      const next = list.filter((_, i) => i !== idx)
      if (selected && !next.some((p) => p.name === selected)) {
        onChange(next, next[0]?.name ?? null)
      }
      return next
    })
  }

  return (
    <section className="rounded-3xl squircle border border-border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('assistant.settings.title')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t('assistant.settings.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t('assistant.settings.add')}
        </Button>
      </div>

      {/* Disclosure: the same sentence the instance key field carries. */}
      <p className="text-xs text-muted-foreground rounded-xl bg-muted/40 px-3 py-2">
        {t('assistant.settings.secretNotice')}
      </p>

      {draft.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('assistant.settings.empty')}</p>
      )}

      {draft.map((p, idx) => (
        <div key={idx} className="rounded-2xl border border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`p-name-${idx}`}>{t('assistant.settings.name')}</Label>
              <Input
                id={`p-name-${idx}`}
                value={p.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                placeholder="our-vllm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`p-model-${idx}`}>{t('assistant.settings.model')}</Label>
              <Input
                id={`p-model-${idx}`}
                value={p.model}
                onChange={(e) => update(idx, { model: e.target.value })}
                placeholder="qwen2.5-72b-instruct"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`p-url-${idx}`}>{t('assistant.settings.baseUrl')}</Label>
            <Input
              id={`p-url-${idx}`}
              value={p.baseUrl}
              onChange={(e) => update(idx, { baseUrl: e.target.value })}
              placeholder="http://10.0.0.7:8000/v1"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">{t('assistant.settings.baseUrlHelp')}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`p-key-${idx}`}>{t('assistant.settings.apiKey')}</Label>
            <Input
              id={`p-key-${idx}`}
              type="password"
              value={p.apiKey ?? ''}
              onChange={(e) => update(idx, { apiKey: e.target.value || undefined })}
              placeholder={t('assistant.settings.apiKeyOptional')}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <Button
              variant={selected === p.name ? 'default' : 'outline'}
              size="sm"
              disabled={!p.name}
              onClick={() => onChange(draft, p.name)}
            >
              {selected === p.name
                ? t('assistant.settings.selected')
                : t('assistant.settings.select')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => remove(idx)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {t('assistant.settings.remove')}
            </Button>
          </div>
        </div>
      ))}

      {draft.length > 0 && (
        <Button
          size="sm"
          onClick={() =>
            onChange(
              draft.filter((p) => p.name.trim() && p.baseUrl.trim() && p.model.trim()),
              selected ?? draft[0]?.name ?? null,
            )
          }
        >
          {t('assistant.settings.save')}
        </Button>
      )}
    </section>
  )
}
