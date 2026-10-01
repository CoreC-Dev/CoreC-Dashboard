/**
 * RuleProviderEditor
 *
 * Structured editor for the `rule-providers` section of CoreCConfig.
 * Rule providers supply external match-only rule-sets that can be referenced
 * via `match: "RULE-SET:provider-name"` in regular rules.
 *
 * Fields: name, type (currently only "file"), path, interval (hot-reload).
 *
 * Integration: CRUD via configStore.upsertRuleProvider/removeRuleProvider.
 * Each provider is a simple inline form row — no wizard needed since the
 * field set is small and static (unlike drivers/transports with per-type
 * dynamic fields).
 *
 * Hot-reload: rule-providers require engine restart (the provider list
 * itself is not hot-updatable, but the file content IS hot-reloaded at
 * the configured `interval`).
 */
import { AlertTriangle, FileInput, FolderOpen, Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfigStore } from '@/stores/configStore'
import type { RuleProviderConfig } from '@/types/config'

export const RuleProviderEditor: React.FC = () => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const upsertRuleProvider = useConfigStore((s) => s.upsertRuleProvider)
  const removeRuleProvider = useConfigStore((s) => s.removeRuleProvider)
  const isRuleProviderNameUnique = useConfigStore((s) => s.isRuleProviderNameUnique)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const dirty = useConfigStore((s) => s.dirty)

  const [editing, setEditing] = useState<RuleProviderConfig | null>(null)
  const [isNew, setIsNew] = useState(false)

  const providers = workingConfig?.['rule-providers'] ?? []

  const startCreate = () => {
    setEditing({ name: '', type: 'file', path: '', interval: '30s' })
    setIsNew(true)
  }

  const startEdit = (name: string) => {
    const existing = providers.find((p) => p.name === name)
    if (existing) {
      setEditing({ ...existing })
      setIsNew(false)
    }
  }

  const handleSave = () => {
    if (!editing?.name.trim() || !editing.path.trim()) return
    if (isNew && !isRuleProviderNameUnique(editing.name.trim())) return
    const ok = upsertRuleProvider({ ...editing, name: editing.name.trim() })
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
            <FileInput className="w-4 h-4 text-primary" />
            <span>{t('ruleProvider.title')}</span>
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
    editing.path.trim() &&
    (!isNew || isRuleProviderNameUnique(editing.name.trim()))

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileInput className="w-4 h-4 text-primary" />
            <span>{t('ruleProvider.title')}</span>
            <Badge
              variant="outline"
              className="text-xs px-1 py-0 border-status-warning/40 bg-status-warning/10 text-status-warning dark:text-status-warning"
            >
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              {t('ruleProvider.restartRequired')}
            </Badge>
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
            {t('ruleProvider.add')}
          </Button>
        </div>
        <CardDescription className="text-xs">{t('ruleProvider.desc')}</CardDescription>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3">
        {providers.length === 0 && !editing && (
          <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
            {t('ruleProvider.empty')}
          </div>
        )}

        {/* Provider list */}
        {providers.length > 0 && (
          <div className="space-y-2">
            {providers.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{p.name}</span>
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      {p.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                    <FolderOpen className="w-3 h-3 shrink-0" />
                    <span className="font-mono truncate">{p.path}</span>
                  </div>
                  {p.interval && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t('ruleProvider.intervalLabel')}:{' '}
                      <span className="font-mono">{p.interval}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(p.name)}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                    title={t('common.edit')}
                  >
                    <FileInput className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRuleProvider(p.name)}
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
                  {t('ruleProvider.name')}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="external-rules"
                  disabled={!isNew}
                  className="h-8 text-xs font-mono"
                />
                {isNew && editing.name && !isRuleProviderNameUnique(editing.name) && (
                  <p className="text-xs text-destructive">{t('ruleProvider.nameExists')}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">{t('ruleProvider.type')}</Label>
                <Input value="file" readOnly className="h-8 text-xs font-mono" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  {t('ruleProvider.path')}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input
                  value={editing.path}
                  onChange={(e) => setEditing({ ...editing, path: e.target.value })}
                  placeholder="/etc/corec/rules/external.yaml"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('ruleProvider.pathHelp')}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">{t('ruleProvider.interval')}</Label>
                <Input
                  value={editing.interval ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, interval: e.target.value || undefined })
                  }
                  placeholder="30s"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('ruleProvider.intervalHelp')}</p>
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
