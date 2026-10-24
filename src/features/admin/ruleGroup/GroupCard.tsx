/**
 * GroupCard — one expandable rule-group accordion item: rename/delete
 * group, compact rules table, add/edit/remove rules via the inline
 * editor. Pure/presentational: props in, callbacks injected.
 */
import { ChevronDown, ChevronRight, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { InlineRuleEditor } from '@/features/admin/ruleGroup/InlineRuleEditor'
import type { RuleConfig } from '@/types/config'

export interface GroupCardProps {
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

export const GroupCard: React.FC<GroupCardProps> = ({
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
  // Sub-rule deletion asks too — the group delete had a confirm while
  // the row delete (the easier one to mis-click) vanished instantly.
  const [deleteRuleName, setDeleteRuleName] = useState<string | null>(null)

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
    <div className="rounded-lg border border-border overflow-hidden">
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
          <Badge variant="outline" className="text-xs px-1 py-0">
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
            <div className="py-4 text-center text-xs text-muted-foreground">
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
                <div className="flex items-center gap-2 rounded-md border border-border/40 bg-card p-2 hover:bg-muted/20 transition-colors">
                  <Badge variant="outline" className="text-xs px-1 py-0 font-mono shrink-0">
                    {rl.priority ?? 100}
                  </Badge>
                  <span className="text-xs font-medium font-mono shrink-0">{rl.name}</span>
                  <Badge variant="secondary" className="text-xs px-1 py-0 shrink-0">
                    {rl.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono truncate flex-1">
                    {rl.match}
                  </span>
                  {rl.target && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      → {rl.target}
                    </span>
                  )}
                  {Array.isArray(rl.targets) && rl.targets.length > 0 && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      → [{rl.targets.join(', ')}]
                    </span>
                  )}
                  {rl.transform && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1 py-0 shrink-0 text-primary dark:text-primary"
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
                      onClick={() => setDeleteRuleName(rl.name)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      aria-label={t('common.delete')}
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
              className="h-7 text-xs w-full border border-dashed"
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
              variant="destructive"
              className="danger-pulse"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sub-rule delete confirmation — same gate as the group delete. */}
      <AlertDialog open={!!deleteRuleName} onOpenChange={(o) => !o && setDeleteRuleName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ruleGroup.deleteRuleTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ruleGroup.deleteRuleConfirm', { name: deleteRuleName ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="danger-pulse"
              onClick={() => {
                if (deleteRuleName) onDeleteRule(name, deleteRuleName)
                setDeleteRuleName(null)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
