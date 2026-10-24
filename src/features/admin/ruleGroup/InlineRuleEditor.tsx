/**
 * InlineRuleEditor — the in-card form for one sub-rule inside a rule
 * group. Pure form logic: state and callbacks arrive via props.
 *
 * Structured editor for the `rule-groups` section of CoreCConfig:
 * rule groups are named collections of sub-rules referenced from
 * regular rules via `match: "SUB-RULE:group-name"`; each group is its
 * own sub-engine (rule/engine.go:SetSubRules).
 */
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { MatchExpressionChips } from '@/components/wizard/MatchExpressionChips'
import { useTransportNames } from '@/hooks/useConfigValidation'
import { validateRuleExpression } from '@/lib/ruleExprValidator'
import { validateTransformExpression } from '@/lib/transformExprValidator'
import { RULE_ACTIONS, type RuleAction, type RuleConfig } from '@/types/config'

export interface InlineRuleEditorProps {
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

export const InlineRuleEditor: React.FC<InlineRuleEditorProps> = ({
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
  // Surface configured transport names so target fields are dropdowns, not
  // free text — the operator should pick from what's already configured.
  const transportNames = useTransportNames()

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
          <Label className="text-xs font-medium">
            {t('ruleGroup.ruleName')}
            <span className="text-destructive"> *</span>
          </Label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="sub-filter-temp"
            disabled={!isNew}
            className="h-7 text-xs font-mono"
          />
          {!nameUnique && (
            <p className="text-xs text-destructive">{t('ruleGroup.ruleNameExists')}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">{t('ruleGroup.ruleAction')}</Label>
          <Select
            value={draft.action as string}
            onValueChange={(v) => setDraft({ ...draft, action: v as RuleAction })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_ACTIONS.map((a) => (
                <SelectItem key={a} value={a} className="text-xs font-mono">
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-medium">
          {t('ruleGroup.ruleMatch')}
          <span className="text-destructive"> *</span>
        </Label>
        <Input
          value={draft.match}
          onChange={(e) => setDraft({ ...draft, match: e.target.value })}
          placeholder='tag contains "temp" || value > 50'
          className="h-7 text-xs font-mono"
        />
        <p className="text-xs text-muted-foreground">{t('ruleGroup.ruleMatchHelp')}</p>
        {/* Quick-insert chips for configured driver/tag names */}
        <MatchExpressionChips
          onInsert={(fragment) =>
            setDraft({ ...draft, match: draft.match ? `${draft.match} && ${fragment}` : fragment })
          }
        />
        {/* Live expression syntax validation */}
        <ExprValidationMessages result={validateRuleExpression(draft.match)} variant="prefix" />
        {/* SUB-RULE quick-fill: insert a reference to another group */}
        {otherGroupNames.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            <span className="text-xs text-muted-foreground self-center">
              {t('ruleGroup.subRuleRef')}:
            </span>
            {otherGroupNames.map((gn) => (
              <button
                type="button"
                key={gn}
                onClick={() => setDraft({ ...draft, match: `SUB-RULE:${gn}` })}
                className="text-xs px-1.5 py-0.5 rounded border border-border bg-muted/30 hover:bg-muted/60 font-mono transition-colors"
              >
                SUB-RULE:{gn}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs font-medium">{t('ruleGroup.ruleTarget')}</Label>
          {transportNames.length === 0 ? (
            <Input
              value={draft.target ?? ''}
              onChange={(e) => setDraft({ ...draft, target: e.target.value || undefined })}
              placeholder="cloud-mqtt"
              className="h-7 text-xs font-mono"
            />
          ) : (
            <Select
              value={draft.target ?? ''}
              onValueChange={(v) => setDraft({ ...draft, target: v || undefined })}
            >
              <SelectTrigger className="h-7 text-xs font-mono">
                <SelectValue placeholder={t('common.none')} />
              </SelectTrigger>
              <SelectContent>
                {transportNames.map((name) => (
                  <SelectItem key={name} value={name} className="text-xs font-mono">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">{t('ruleGroup.rulePriority')}</Label>
          <Input
            type="number"
            value={draft.priority ?? 100}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
            min={0}
            className="h-7 text-xs font-mono w-20"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`grp-continue-${draft.name}`}
          checked={draft.continue === true}
          onCheckedChange={(v) => setDraft({ ...draft, continue: v === true ? true : undefined })}
          disabled={draft.action === 'drop'}
        />
        <label
          htmlFor={`grp-continue-${draft.name}`}
          className="text-xs font-medium cursor-pointer"
        >
          {t('rules.edit.continue')}
        </label>
      </div>
      {/* Multi-target (comma-separated) — used by mirror action */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">{t('ruleGroup.ruleTargets')}</Label>
        {transportNames.length === 0 ? (
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
            className="h-7 text-xs font-mono"
          />
        ) : (
          <div className="space-y-0.5 rounded-md border p-1.5 max-h-28 overflow-y-auto">
            {transportNames.map((name) => {
              const selected = Array.isArray(draft.targets) && draft.targets.includes(name)
              return (
                <label
                  key={name}
                  htmlFor={`grp-tgt-${name}`}
                  className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-accent/40"
                >
                  <Checkbox
                    id={`grp-tgt-${name}`}
                    checked={selected}
                    onCheckedChange={() => {
                      const current = Array.isArray(draft.targets) ? draft.targets : []
                      const next = selected ? current.filter((n) => n !== name) : [...current, name]
                      setDraft({ ...draft, targets: next.length > 0 ? next : undefined })
                    }}
                  />
                  <span className="text-xs font-mono">{name}</span>
                </label>
              )
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t('ruleGroup.ruleTargetsHelp')}</p>
      </div>
      {/* Transform config — used by transform action */}
      {draft.action === 'transform' && (
        <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium">
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
              className="h-7 text-xs font-mono"
            />
            <p className="text-xs text-muted-foreground">{t('ruleWizard.transformExprHelp')}</p>
            <ExprValidationMessages
              result={validateTransformExpression(draft.transform?.expression ?? '')}
              variant="prefix"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">{t('ruleWizard.tagRename')}</Label>
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
              className="h-7 text-xs font-mono"
            />
            <p className="text-xs text-muted-foreground">{t('ruleWizard.tagRenameHelp')}</p>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-1.5 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 text-xs">
          {t('common.cancel')}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => canSave && onSave({ ...draft, name: draft.name.trim() })}
          disabled={!canSave}
          className="h-6 text-xs"
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
