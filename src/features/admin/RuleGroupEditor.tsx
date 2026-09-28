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
 */
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ExprValidationMessages } from '@/components/wizard/ExprValidationMessages'
import { validateRuleExpression } from '@/lib/ruleExprValidator'
import { validateTransformExpression } from '@/lib/transformExprValidator'
import { useConfigStore } from '@/stores/configStore'
import { RULE_ACTIONS, type RuleAction, type RuleConfig } from '@/types/config'

// ─── Inline rule editor (within a group) ─────────────────────────────

interface InlineRuleEditorProps {
  rule: RuleConfig
  isNew: boolean
  existingNames: string[]
  /** Names of all other rule groups (for SUB-RULE quick-fill buttons) */
  availableGroupNames: string[]
  /** Current group name (excluded from SUB-RULE list to prevent self-ref) */
  currentGroupName: string
  onSave: (rule: RuleConfig) => void
  onCancel: () => void
}

const InlineRuleEditor: React.FC<InlineRuleEditorProps> = ({
  rule,
  isNew,
  existingNames,
  availableGroupNames,
  currentGroupName,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<RuleConfig>({ ...rule })

  const nameUnique = !existingNames.includes(draft.name.trim()) || !isNew
  const canSave =
    draft.name.trim() &&
    draft.match.trim() &&
    nameUnique &&
    (draft.action !== 'transform' || !!draft.transform?.expression?.trim())

  // Other group names available for SUB-RULE referencing (exclude self
  // to prevent direct self-reference; circular detection is in validateConfig).
  const otherGroupNames = availableGroupNames.filter((n) => n !== currentGroupName)

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] font-medium">
            {t('ruleGroup.ruleName')}
            <span className="text-destructive"> *</span>
          </Label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="sub-filter-temp"
            disabled={!isNew}
            className="h-7 text-[11px] font-mono"
          />
          {!nameUnique && (
            <p className="text-[9px] text-destructive">{t('ruleGroup.ruleNameExists')}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-medium">{t('ruleGroup.ruleAction')}</Label>
          <Select
            value={draft.action as string}
            onValueChange={(v) => setDraft({ ...draft, action: v as RuleAction })}
          >
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_ACTIONS.map((a) => (
                <SelectItem key={a} value={a} className="text-[11px] font-mono">
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] font-medium">
          {t('ruleGroup.ruleMatch')}
          <span className="text-destructive"> *</span>
        </Label>
        <Input
          value={draft.match}
          onChange={(e) => setDraft({ ...draft, match: e.target.value })}
          placeholder='tag contains "temp" || value > 50'
          className="h-7 text-[11px] font-mono"
        />
        <p className="text-[9px] text-muted-foreground">{t('ruleGroup.ruleMatchHelp')}</p>
        {/* Live expression syntax validation */}
        <ExprValidationMessages result={validateRuleExpression(draft.match)} variant="prefix" />
        {/* SUB-RULE quick-fill: insert a reference to another group */}
        {otherGroupNames.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            <span className="text-[9px] text-muted-foreground self-center">
              {t('ruleGroup.subRuleRef')}:
            </span>
            {otherGroupNames.map((gn) => (
              <button
                type="button"
                key={gn}
                onClick={() => setDraft({ ...draft, match: `SUB-RULE:${gn}` })}
                className="text-[9px] px-1.5 py-0.5 rounded border border-border bg-muted/30 hover:bg-muted/60 font-mono transition-colors"
              >
                SUB-RULE:{gn}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] font-medium">{t('ruleGroup.ruleTarget')}</Label>
          <Input
            value={draft.target ?? ''}
            onChange={(e) => setDraft({ ...draft, target: e.target.value || undefined })}
            placeholder="cloud-mqtt"
            className="h-7 text-[11px] font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-medium">{t('ruleGroup.rulePriority')}</Label>
          <Input
            type="number"
            value={draft.priority ?? 100}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
            min={0}
            className="h-7 text-[11px] font-mono w-20"
          />
        </div>
      </div>
      {/* Multi-target (comma-separated) — used by mirror action */}
      <div className="space-y-1">
        <Label className="text-[10px] font-medium">{t('ruleGroup.ruleTargets')}</Label>
        <Input
          value={Array.isArray(draft.targets) ? draft.targets.join(', ') : ''}
          onChange={(e) => {
            const targets = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
            setDraft({ ...draft, targets: targets.length > 0 ? targets : undefined })
          }}
          placeholder="mqtt-cloud, http-archive"
          className="h-7 text-[11px] font-mono"
        />
        <p className="text-[9px] text-muted-foreground">{t('ruleGroup.ruleTargetsHelp')}</p>
      </div>
      {/* Transform config — used by transform action */}
      {draft.action === 'transform' && (
        <div className="space-y-2 rounded-md border border-purple-500/20 bg-purple-500/5 p-2">
          <div className="space-y-1">
            <Label className="text-[10px] font-medium">
              {t('ruleWizard.transformExpression')}
              <span className="text-destructive"> *</span>
            </Label>
            <Input
              value={draft.transform?.expression ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  transform: {
                    expression: e.target.value,
                    ...(draft.transform?.['tag-rename']
                      ? { 'tag-rename': draft.transform['tag-rename'] }
                      : {}),
                  },
                })
              }
              placeholder="value * 1.8 + 32"
              className="h-7 text-[11px] font-mono"
            />
            <p className="text-[9px] text-muted-foreground">{t('ruleWizard.transformExprHelp')}</p>
            <ExprValidationMessages
              result={validateTransformExpression(draft.transform?.expression ?? '')}
              variant="prefix"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-medium">{t('ruleWizard.tagRename')}</Label>
            <Input
              value={draft.transform?.['tag-rename'] ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  transform: {
                    expression: draft.transform?.expression ?? '',
                    ...(e.target.value ? { 'tag-rename': e.target.value } : {}),
                  },
                })
              }
              placeholder="temperature_f"
              className="h-7 text-[11px] font-mono"
            />
            <p className="text-[9px] text-muted-foreground">{t('ruleWizard.tagRenameHelp')}</p>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-1.5 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 text-[10px]">
          {t('common.cancel')}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => canSave && onSave({ ...draft, name: draft.name.trim() })}
          disabled={!canSave}
          className="h-6 text-[10px]"
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

// ─── Single group card ───────────────────────────────────────────────

interface GroupCardProps {
  name: string
  rules: RuleConfig[]
  /** All group names in the config (for SUB-RULE quick-fill in inline editor) */
  allGroupNames: string[]
  onRename: (oldName: string, newName: string) => void
  onDelete: (name: string) => void
  onAddRule: (groupName: string, rule: RuleConfig) => void
  onEditRule: (groupName: string, oldRuleName: string, rule: RuleConfig) => void
  onDeleteRule: (groupName: string, ruleName: string) => void
}

const GroupCard: React.FC<GroupCardProps> = ({
  name,
  rules,
  allGroupNames,
  onRename,
  onDelete,
  onAddRule,
  onEditRule,
  onDeleteRule,
}) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(name)
  const [addingRule, setAddingRule] = useState(false)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ruleNames = rules.map((r) => r.name)

  const handleSaveNewRule = (rule: RuleConfig) => {
    onAddRule(name, rule)
    setAddingRule(false)
  }

  const handleSaveEditRule = (rule: RuleConfig) => {
    if (editingRule) {
      onEditRule(name, editingRule, rule)
      setEditingRule(null)
    }
  }

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 hover:bg-muted/20 transition-colors">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
          )}
          <FolderTree className="w-4 h-4 shrink-0 text-primary" />
          {renaming ? (
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  if (newName.trim() && newName !== name) onRename(name, newName.trim())
                  setRenaming(false)
                }
                if (e.key === 'Escape') {
                  setNewName(name)
                  setRenaming(false)
                }
              }}
              className="h-6 text-xs font-mono w-40"
            />
          ) : (
            <span className="text-xs font-semibold font-mono">{name}</span>
          )}
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            {rules.length} {t('ruleGroup.rulesCount')}
          </Badge>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setNewName(name)
              setRenaming(true)
            }}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title={t('common.edit')}
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title={t('common.delete')}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/40 p-3 space-y-2 bg-muted/10">
          {rules.length === 0 && !addingRule && (
            <div className="py-4 text-center text-[11px] text-muted-foreground">
              {t('ruleGroup.noRules')}
            </div>
          )}

          {/* Rule rows */}
          {rules.map((rl) => (
            <div key={rl.name}>
              {editingRule === rl.name ? (
                <InlineRuleEditor
                  rule={rl}
                  isNew={false}
                  existingNames={ruleNames.filter((n) => n !== rl.name)}
                  availableGroupNames={allGroupNames}
                  currentGroupName={name}
                  onSave={handleSaveEditRule}
                  onCancel={() => setEditingRule(null)}
                />
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-border/40 bg-card/40 p-2 hover:bg-muted/20 transition-colors">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono shrink-0">
                    {rl.priority ?? 100}
                  </Badge>
                  <span className="text-[11px] font-medium font-mono shrink-0">{rl.name}</span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                    {rl.action}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono truncate flex-1">
                    {rl.match}
                  </span>
                  {rl.target && (
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      → {rl.target}
                    </span>
                  )}
                  {Array.isArray(rl.targets) && rl.targets.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      → [{rl.targets.join(', ')}]
                    </span>
                  )}
                  {rl.transform && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 shrink-0 text-purple-600 dark:text-purple-400"
                    >
                      transform
                    </Badge>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingRule(rl.name)}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRule(name, rl.name)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add rule form */}
          {addingRule && (
            <InlineRuleEditor
              rule={{ name: '', match: '', action: 'forward', priority: 100 }}
              isNew={true}
              existingNames={ruleNames}
              availableGroupNames={allGroupNames}
              currentGroupName={name}
              onSave={handleSaveNewRule}
              onCancel={() => setAddingRule(false)}
            />
          )}

          {/* Add rule button */}
          {!addingRule && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddingRule(true)}
              className="h-7 text-[11px] w-full border border-dashed"
            >
              <Plus className="w-3 h-3 mr-1" />
              {t('ruleGroup.addRule')}
            </Button>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ruleGroup.deleteGroupTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ruleGroup.deleteGroupConfirm', { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(name)
                setConfirmDelete(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────

export const RuleGroupEditor: React.FC = () => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const upsertRuleGroup = useConfigStore((s) => s.upsertRuleGroup)
  const removeRuleGroup = useConfigStore((s) => s.removeRuleGroup)
  const isRuleGroupNameUnique = useConfigStore((s) => s.isRuleGroupNameUnique)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const dirty = useConfigStore((s) => s.dirty)

  const [newGroupName, setNewGroupName] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const groups = workingConfig?.['rule-groups'] ?? {}
  const groupEntries = Object.entries(groups)

  const handleCreate = () => {
    const name = newGroupName.trim()
    if (!name || !isRuleGroupNameUnique(name)) return
    upsertRuleGroup(name, [])
    setNewGroupName('')
    setShowCreate(false)
  }

  const handleRename = (oldName: string, newName: string) => {
    if (oldName === newName) return
    if (!isRuleGroupNameUnique(newName)) return
    const rules = groups[oldName] ?? []
    removeRuleGroup(oldName)
    upsertRuleGroup(newName, rules)
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
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-primary" />
            <span>{t('ruleGroup.title')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
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
    <Card className="border-border/80 bg-card/60">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-primary" />
            <span>{t('ruleGroup.title')}</span>
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              {t('ruleGroup.restartRequired')}
            </Badge>
            {dirty && (
              <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-600">
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

      <CardContent className="p-4 pt-1 space-y-2">
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
              <span className="text-[10px] text-destructive shrink-0">
                {t('ruleGroup.nameExists')}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreate(false)}
              className="h-6 text-[10px]"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCreate}
              disabled={!canCreate}
              className="h-6 text-[10px]"
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
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2.5 text-[10px] text-muted-foreground">
            {t('ruleGroup.usageHint')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
