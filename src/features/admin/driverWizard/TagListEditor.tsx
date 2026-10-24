// Tag list editor (inline adapter for the wizard): wraps TagListField's
// logic with plain state instead of a useForm form.

import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
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
import type { DriverConfig } from '@/types/config'
import { DATA_TYPES } from '@/types/config'

export const TagListEditor: React.FC<{
  tags: DriverConfig['tags']
  onChange: (tags: DriverConfig['tags']) => void
  required: boolean
}> = ({ tags, onChange, required }) => {
  const { t } = useTranslation()
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

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
          <div className="grid grid-cols-[1fr_1fr_100px_1fr_90px_28px_36px] gap-2 bg-muted/60 border-b px-3 py-1.5 text-xs uppercase font-semibold text-muted-foreground">
            <span>{t('common.name')} *</span>
            <span>{t('wizard.address')} *</span>
            <span>{t('wizard.type')} *</span>
            <span>{t('wizard.group')}</span>
            <span>{t('wizard.interval')}</span>
            <span />
            <span />
          </div>
          {tags.map((tag, idx) => {
            const hasAdvanced =
              tag.scale !== undefined ||
              tag.offset !== undefined ||
              tag.deadband !== undefined ||
              tag['read-timeout'] !== undefined
            const isExpanded = expandedIdx === idx
            return (
              <div key={idx} className="border-b last:border-b-0">
                <div className="grid grid-cols-[1fr_1fr_100px_1fr_90px_28px_36px] gap-2 px-3 py-1.5 items-center hover:bg-muted/20">
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
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className={`p-1 rounded hover:bg-muted text-muted-foreground justify-self-end ${hasAdvanced ? 'text-primary' : ''}`}
                    title={t('wizard.tagAdvanced')}
                  >
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTag(idx)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive justify-self-end"
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {isExpanded && (
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-muted/10 border-t border-dashed text-xs">
                    <div className="space-y-1">
                      <label className="text-muted-foreground">{t('wizard.tagScale')}</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={tag.scale ?? ''}
                        onChange={(e) =>
                          updateTag(
                            idx,
                            'scale',
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        placeholder="1.0"
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-muted-foreground">{t('wizard.tagOffset')}</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={tag.offset ?? ''}
                        onChange={(e) =>
                          updateTag(
                            idx,
                            'offset',
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        placeholder="0.0"
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-muted-foreground">{t('wizard.tagDeadband')}</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={tag.deadband ?? ''}
                        onChange={(e) =>
                          updateTag(
                            idx,
                            'deadband',
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        placeholder="0"
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-muted-foreground">{t('wizard.tagReadTimeout')}</label>
                      <Input
                        value={tag['read-timeout'] ?? ''}
                        onChange={(e) =>
                          updateTag(idx, 'read-timeout', e.target.value || undefined)
                        }
                        placeholder="1s"
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {required && tags.length === 0 && (
        <p className="text-xs text-destructive">{t('wizard.tagsRequired')}</p>
      )}
    </div>
  )
}
