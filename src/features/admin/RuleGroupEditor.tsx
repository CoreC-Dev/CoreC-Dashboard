/**
 * RuleGroupEditor
 *
 * Structured editor for the `rule-groups` section of CoreCConfig.
 * Rule groups are named collections of sub-rules that can be referenced
 * from regular rules via `match: "SUB-RULE:group-name"`.
 *
 * Each group is its own sub-engine (rule/engine.go:SetSubRules). Circular
 * SUB-RULE references are detected by CoreC at load time.
 *
 * UI structure:
 *   - List of groups as expandable accordion items
 *   - Each group shows its rules in a compact table
 *   - Create group: inline name input
 *   - Delete group: button with confirm
 *   - Add/edit/remove rules within a group: inline forms
 *
 * Integration: CRUD via configStore.upsertRuleGroup/removeRuleGroup.
 * Hot-reload: rule-groups require engine restart.
 *
 * D2 (quality audit 2026-10-21): the inline editor and group card moved
 * to ./ruleGroup/ — this file is the page-level composition only.
 */
import { AlertTriangle, FolderTree, Plus } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GroupCard } from '@/features/admin/ruleGroup/GroupCard'
import { findSubRuleReferences, rewriteRuleListRefs, type SubRuleRef } from '@/lib/subRuleRefs'
import { useConfigStore } from '@/stores/configStore'
import type { RuleConfig } from '@/types/config'

export const RuleGroupEditor: React.FC = () => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const upsertRuleGroup = useConfigStore((s) => s.upsertRuleGroup)
  const removeRuleGroup = useConfigStore((s) => s.removeRuleGroup)
  const upsertRule = useConfigStore((s) => s.upsertRule)
  const isRuleGroupNameUnique = useConfigStore((s) => s.isRuleGroupNameUnique)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const dirty = useConfigStore((s) => s.dirty)

  const [newGroupName, setNewGroupName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  // C-B5: rename → SUB-RULE reference scan → confirm dialog (with a
  // default-on "rewrite the references too" checkbox).
  const [pendingRename, setPendingRename] = useState<{
    oldName: string
    newName: string
    refs: SubRuleRef[]
  } | null>(null)
  const [updateRefs, setUpdateRefs] = useState(true)

  const groups = workingConfig?.['rule-groups'] ?? {}
  const groupEntries = Object.entries(groups)

  const handleCreate = () => {
    const name = newGroupName.trim()
    if (!name || !isRuleGroupNameUnique(name)) return
    upsertRuleGroup(name, [])
    setNewGroupName('')
    setShowCreate(false)
  }

  /** Rename the group and (optionally) rewrite SUB-RULE refs to it. The
   *  config snapshot is taken before the rename: top-level rules and OTHER
   *  groups are untouched by the group's own rename, so the pre-rename
   *  lists stay valid rewrite sources. */
  const performRename = (
    oldName: string,
    newName: string,
    refs: readonly SubRuleRef[],
    withRefUpdate: boolean,
  ) => {
    const cfg = useConfigStore.getState().workingConfig
    removeRuleGroup(oldName)
    upsertRuleGroup(newName, groups[oldName] ?? [])
    if (!withRefUpdate) return
    for (const ref of refs) {
      if (ref.inGroup === null) {
        const topRule = cfg?.rules?.find((r) => r.name === ref.ruleName)
        if (topRule) upsertRule(rewriteRuleListRefs([topRule], oldName, newName)[0]!)
      } else {
        const groupRules = cfg?.['rule-groups']?.[ref.inGroup] ?? []
        upsertRuleGroup(ref.inGroup, rewriteRuleListRefs(groupRules, oldName, newName))
      }
    }
  }

  const handleRename = (oldName: string, newName: string) => {
    if (oldName === newName) return
    if (!isRuleGroupNameUnique(newName)) return
    // C-B5: references break silently otherwise — list them and offer the
    // rewrite before the rename lands in the working config.
    const refs = findSubRuleReferences(workingConfig, oldName)
    if (refs.length === 0) {
      performRename(oldName, newName, refs, false)
      return
    }
    setUpdateRefs(true)
    setPendingRename({ oldName, newName, refs })
  }

  const confirmPendingRename = () => {
    if (!pendingRename) return
    performRename(pendingRename.oldName, pendingRename.newName, pendingRename.refs, updateRefs)
    setPendingRename(null)
  }

  const handleDelete = (name: string) => {
    removeRuleGroup(name)
  }

  const handleAddRule = (groupName: string, rule: RuleConfig) => {
    const rules = groups[groupName] ?? []
    upsertRuleGroup(groupName, [...rules, rule])
  }

  const handleEditRule = (groupName: string, oldRuleName: string, rule: RuleConfig) => {
    const rules = groups[groupName] ?? []
    const next = rules.map((r) => (r.name === oldRuleName ? rule : r))
    upsertRuleGroup(groupName, next)
  }

  const handleDeleteRule = (groupName: string, ruleName: string) => {
    const rules = groups[groupName] ?? []
    upsertRuleGroup(
      groupName,
      rules.filter((r) => r.name !== ruleName),
    )
  }

  if (!workingConfig) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-primary" />
            <span>{t('ruleGroup.title')}</span>
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

  const canCreate = newGroupName.trim() && isRuleGroupNameUnique(newGroupName.trim())

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-primary" />
            <span>{t('ruleGroup.title')}</span>
            <Badge
              variant="outline"
              className="text-xs px-1 py-0 border-status-warning/40 bg-status-warning/10 text-status-warning dark:text-status-warning"
            >
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              {t('ruleGroup.restartRequired')}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreate((s) => !s)}
            className="h-7 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t('ruleGroup.addGroup')}
          </Button>
        </div>
        <CardDescription className="text-xs">{t('ruleGroup.desc')}</CardDescription>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-2">
        {groupEntries.length === 0 && !showCreate && (
          <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
            {t('ruleGroup.empty')}
          </div>
        )}

        {/* Create new group */}
        {showCreate && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Label className="text-xs font-medium shrink-0">{t('ruleGroup.groupName')}</Label>
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) handleCreate()
                if (e.key === 'Escape') {
                  setNewGroupName('')
                  setShowCreate(false)
                }
              }}
              placeholder="filter-by-device"
              className="h-7 text-xs font-mono flex-1"
              autoFocus
            />
            {newGroupName && !isRuleGroupNameUnique(newGroupName.trim()) && (
              <span className="text-xs text-destructive shrink-0">{t('ruleGroup.nameExists')}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreate(false)}
              className="h-6 text-xs"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCreate}
              disabled={!canCreate}
              className="h-6 text-xs"
            >
              {t('common.save')}
            </Button>
          </div>
        )}

        {/* Group cards */}
        {groupEntries.map(([name, rules]) => (
          <GroupCard
            key={name}
            name={name}
            rules={rules}
            allGroupNames={groupEntries.map(([n]) => n)}
            onRename={handleRename}
            onDelete={handleDelete}
            onAddRule={handleAddRule}
            onEditRule={handleEditRule}
            onDeleteRule={handleDeleteRule}
          />
        ))}

        {/* Usage hint */}
        {groupEntries.length > 0 && (
          <div className="rounded-md border border-status-queued/20 bg-status-queued/5 p-2.5 text-xs text-muted-foreground">
            {t('ruleGroup.usageHint')}
          </div>
        )}

        {/* C-B5: rename confirmation when SUB-RULE references would break */}
        <AlertDialog open={!!pendingRename} onOpenChange={(o) => !o && setPendingRename(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('ruleGroup.renameTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('ruleGroup.renameRefsWarning', { count: pendingRename?.refs.length ?? 0 })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
              {pendingRename?.refs.map((ref) => (
                <li
                  key={`${ref.inGroup ?? 'top'}-${ref.ruleName}`}
                  className="truncate font-mono text-muted-foreground"
                >
                  {ref.ruleName}
                  <span className="text-muted-foreground/60">
                    {' '}
                    ({ref.inGroup ?? t('ruleGroup.renameRefTopLevel')})
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Checkbox
                id="rename-update-refs"
                checked={updateRefs}
                onCheckedChange={(v) => setUpdateRefs(v === true)}
              />
              <label htmlFor="rename-update-refs" className="cursor-pointer text-xs font-medium">
                {t('ruleGroup.renameUpdateRefs')}
              </label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmPendingRename}>
                {t('ruleGroup.renameAction')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
