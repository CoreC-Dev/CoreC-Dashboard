/**
 * DerivedTagsEditor
 *
 * Structured editor for the `derived-tags` section of CoreCConfig.
 * Derived tags are computed KPI values evaluated from arithmetic expressions
 * over cached tag values (e.g. `efficiency = output / input * 100`).
 *
 * Fields: name, expr, type, group, interval, unit, on-missing, stale-guard.
 *
 * Integration: CRUD via configStore.upsertDerivedTag/removeDerivedTag.
 * Each tag is an inline form row — no wizard needed since the field set
 * is small and static (unlike drivers/transports with per-type dynamic
 * fields).
 *
 * Hot-reload: derived-tags are hot-updatable via PUT /configs (no restart
 * required — the engine re-evaluates expressions at the configured interval).
 */
import { Calculator, Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfigStore } from '@/stores/configStore'
import { DATA_TYPES, type DerivedTagConfig, ON_MISSING_POLICIES } from '@/types/config'

export const DerivedTagsEditor: React.FC = () => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const upsertDerivedTag = useConfigStore((s) => s.upsertDerivedTag)
  const removeDerivedTag = useConfigStore((s) => s.removeDerivedTag)
  const isDerivedTagNameUnique = useConfigStore((s) => s.isDerivedTagNameUnique)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const dirty = useConfigStore((s) => s.dirty)

  const [editing, setEditing] = useState<DerivedTagConfig | null>(null)
  const [isNew, setIsNew] = useState(false)

  const tags = workingConfig?.['derived-tags'] ?? []

  const startCreate = () => {
    setEditing({ name: '', expr: '', type: 'float64', interval: '5s' })
    setIsNew(true)
  }

  const startEdit = (name: string) => {
    const existing = tags.find((tg) => tg.name === name)
    if (existing) {
      setEditing({ ...existing })
      setIsNew(false)
    }
  }

  const handleSave = () => {
    if (!editing?.name.trim() || !editing.expr.trim()) return
    if (isNew && !isDerivedTagNameUnique(editing.name.trim())) return
    const ok = upsertDerivedTag({ ...editing, name: editing.name.trim() })
    if (ok) {
      setEditing(null)
      setIsNew(false)
    }
  }

  const handleCancel = () => {
    setEditing(null)
    setIsNew(false)
  }

  if (!workingConfig) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <span>{t('derivedTag.title')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetToEmpty()}
            className="h-8 text-xs"
          >
            {t('globalConfig.initConfig')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const canSave =
    editing?.name.trim() &&
    editing.expr.trim() &&
    editing.interval.trim() &&
    (!isNew || isDerivedTagNameUnique(editing.name.trim()))

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            <span>{t('derivedTag.title')}</span>
            {dirty && (
              <Badge
                variant="outline"
                className="text-xs border-status-warning/40 text-status-warning"
              >
                {t('globalConfig.unsaved')}
              </Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={startCreate} className="h-7 text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t('derivedTag.add')}
          </Button>
        </div>
        <CardDescription className="text-xs">{t('derivedTag.desc')}</CardDescription>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3">
        {tags.length === 0 && !editing && (
          <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
            {t('derivedTag.empty')}
          </div>
        )}

        {/* Tag list */}
        {tags.length > 0 && (
          <div className="space-y-2">
            {tags.map((tg) => (
              <div
                key={tg.name}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{tg.name}</span>
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      {tg.type}
                    </Badge>
                    {tg.group && (
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        {tg.group}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                    {tg.expr}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t('derivedTag.intervalLabel')}:{' '}
                    <span className="font-mono">{tg.interval}</span>
                    {tg.unit && (
                      <>
                        {' '}
                        · {t('derivedTag.unitLabel')}: <span className="font-mono">{tg.unit}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(tg.name)}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                    title={t('common.edit')}
                  >
                    <Calculator className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDerivedTag(tg.name)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline edit/create form */}
        {editing && (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  {t('derivedTag.name')}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="efficiency"
                  disabled={!isNew}
                  className="h-8 text-xs font-mono"
                />
                {isNew && editing.name && !isDerivedTagNameUnique(editing.name) && (
                  <p className="text-xs text-destructive">{t('derivedTag.nameExists')}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  {t('derivedTag.type')}
                  <span className="text-destructive"> *</span>
                </Label>
                <Select
                  value={editing.type}
                  onValueChange={(v) => setEditing({ ...editing, type: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map((dt) => (
                      <SelectItem key={dt} value={dt}>
                        {dt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-medium">
                  {t('derivedTag.expr')}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input
                  value={editing.expr}
                  onChange={(e) => setEditing({ ...editing, expr: e.target.value })}
                  placeholder="(output / input) * 100"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('derivedTag.exprHelp')}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">{t('derivedTag.group')}</Label>
                <Input
                  value={editing.group ?? ''}
                  onChange={(e) => setEditing({ ...editing, group: e.target.value || undefined })}
                  placeholder="kpi"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  {t('derivedTag.interval')}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input
                  value={editing.interval}
                  onChange={(e) => setEditing({ ...editing, interval: e.target.value })}
                  placeholder="5s"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('derivedTag.intervalHelp')}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">{t('derivedTag.unit')}</Label>
                <Input
                  value={editing.unit ?? ''}
                  onChange={(e) => setEditing({ ...editing, unit: e.target.value || undefined })}
                  placeholder="%"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">{t('derivedTag.onMissing')}</Label>
                <Select
                  value={editing['on-missing'] ?? ''}
                  onValueChange={(v) =>
                    setEditing({
                      ...editing,
                      'on-missing': (v || undefined) as DerivedTagConfig['on-missing'],
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t('derivedTag.onMissingDefault')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ON_MISSING_POLICIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('derivedTag.onMissingHelp')}</p>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-medium">{t('derivedTag.staleGuard')}</Label>
                <Input
                  value={editing['stale-guard'] ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, 'stale-guard': e.target.value || undefined })
                  }
                  placeholder="30s"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('derivedTag.staleGuardHelp')}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 text-xs">
                {t('common.cancel')}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={!canSave}
                className="h-7 text-xs"
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
