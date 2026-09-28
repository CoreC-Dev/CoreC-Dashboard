/**
 * RuleWizard
 *
 * Multi-step wizard for creating or editing a rule configuration.
 * Steps:
 *   Step 1 — Basics: rule name + match DSL expression + priority
 *   Step 2 — Action: choose action (forward/drop/alert/transform/mirror)
 *   Step 3 — Target: conditional on action:
 *              forward  → single target transport select
 *              mirror   → multiple target transports (checkbox list)
 *              drop     → (skipped, no target needed)
 *              alert    → (skipped, no target needed)
 *              transform→ transform config (expression + tag-rename)
 *   Step 4 — Preview & Save: YAML preview → configStore.upsertRule
 *
 * The wizard implements the rule logic the user requested:
 * "corec的配置是很复杂且有逻辑在里面的，Dashboard也需要有逻辑"
 * — the action type determines which fields are required and which
 *   steps are shown, mirroring CoreC's rule validation.
 *
 * Match DSL reference (from CoreC rule/expr.go):
 *   Fields: driver, device, group, tag, quality, type, value
 *   Operators: ==, !=, >, <, >=, <=, =~ (regex), !~ (regex neg),
 *              contains, suffix, prefix, in (range), &&, ||, !
 *   Special: "ALL" matches everything
 */
import { AlertCircle, ArrowRight, CheckCircle2, GitBranch, Plus, Trash2, Zap } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Textarea } from '@/components/ui/textarea'
import { WizardDialog, type WizardStep } from '@/components/wizard/Wizard'
import { dumpConfigYaml } from '@/lib/configYaml'
import { validateRuleInContext } from '@/lib/entityValidation'
import { validateRuleExpression } from '@/lib/ruleExprValidator'
import { validateTransformExpression } from '@/lib/transformExprValidator'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import { useTransportNames } from '@/hooks/useConfigValidation'
import type { RuleAction, RuleConfig } from '@/types/config'

// ─── Action metadata ──────────────────────────────────────────────────

interface ActionMeta {
  action: RuleAction
  labelKey: string
  icon: React.ReactNode
  descKey: string
  needsTarget: 'single' | 'multi' | 'none' | 'transform'
}

const ACTION_META: ActionMeta[] = [
  {
    action: 'forward',
    labelKey: 'ruleWizard.actionForward',
    icon: <ArrowRight className="h-4 w-4" />,
    descKey: 'ruleWizard.actionForwardDesc',
    needsTarget: 'single',
  },
  {
    action: 'drop',
    labelKey: 'ruleWizard.actionDrop',
    icon: <Trash2 className="h-4 w-4" />,
    descKey: 'ruleWizard.actionDropDesc',
    needsTarget: 'none',
  },
  {
    action: 'alert',
    labelKey: 'ruleWizard.actionAlert',
    icon: <Zap className="h-4 w-4" />,
    descKey: 'ruleWizard.actionAlertDesc',
    needsTarget: 'none',
  },
  {
    action: 'transform',
    labelKey: 'ruleWizard.actionTransform',
    icon: <GitBranch className="h-4 w-4" />,
    descKey: 'ruleWizard.actionTransformDesc',
    needsTarget: 'transform',
  },
  {
    action: 'mirror',
    labelKey: 'ruleWizard.actionMirror',
    icon: <Plus className="h-4 w-4" />,
    descKey: 'ruleWizard.actionMirrorDesc',
    needsTarget: 'multi',
  },
]

// ─── Match DSL quick templates ────────────────────────────────────────

const MATCH_TEMPLATES: { label: string; value: string }[] = [
  { label: 'ALL', value: 'ALL' },
  { label: 'driver == "plc-modbus"', value: 'driver == "plc-modbus"' },
  { label: 'tag contains "temp"', value: 'tag contains "temp"' },
  { label: 'value > 90', value: 'value > 90' },
  { label: 'quality == "good"', value: 'quality == "good"' },
  { label: 'driver == "x" && value > 50', value: 'driver == "x" && value > 50' },
]

// ─── Component ───────────────────────────────────────────────────────

export interface RuleWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingRule?: RuleConfig
  onSaved?: () => void
}

export const RuleWizard: React.FC<RuleWizardProps> = ({
  open,
  onOpenChange,
  existingRule,
  onSaved,
}) => {
  const { t } = useTranslation()
  const upsertRule = useConfigStore((s) => s.upsertRule)
  const isRuleNameUnique = useConfigStore((s) => s.isRuleNameUnique)
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const transportNames = useTransportNames()
  const isEdit = !!existingRule

  // ─── Form state ──────────────────────────────────────────────────
  const [ruleName, setRuleName] = useState(existingRule?.name ?? '')
  const [match, setMatch] = useState(existingRule?.match ?? 'ALL')
  const [priority, setPriority] = useState(existingRule?.priority ?? 100)
  const [action, setAction] = useState<RuleAction>(
    (existingRule?.action as RuleAction) ?? 'forward',
  )
  // Single target (forward)
  const [target, setTarget] = useState(existingRule?.target ?? '')
  // Multiple targets (mirror)
  const [targets, setTargets] = useState<string[]>(existingRule?.targets ?? [])
  // Transform config
  const [transformExpr, setTransformExpr] = useState(existingRule?.transform?.expression ?? '')
  const [tagRename, setTagRename] = useState(existingRule?.transform?.['tag-rename'] ?? '')
  const [currentStep, setCurrentStep] = useState(0)

  // Reset on open
  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setRuleName(existingRule?.name ?? '')
    setMatch(existingRule?.match ?? 'ALL')
    setPriority(existingRule?.priority ?? 100)
    setAction((existingRule?.action as RuleAction) ?? 'forward')
    setTarget(existingRule?.target ?? '')
    setTargets(existingRule?.targets ?? [])
    setTransformExpr(existingRule?.transform?.expression ?? '')
    setTagRename(existingRule?.transform?.['tag-rename'] ?? '')
    setCurrentStep(0)
  }
  if (!open && lastOpen) setLastOpen(false)

  // ─── Determine which steps to show based on action ───────────────
  const actionMeta = ACTION_META.find((m) => m.action === action)!
  const needsTargetStep = actionMeta.needsTarget !== 'none'

  // ─── Preview YAML ────────────────────────────────────────────────
  const previewYaml = useMemo(() => {
    const rule: RuleConfig = {
      name: ruleName || '<rule-name>',
      match,
      action,
      priority,
      ...(action === 'forward' && target ? { target } : {}),
      ...(action === 'mirror' && targets.length > 0 ? { targets } : {}),
      ...(action === 'transform' && transformExpr
        ? {
            transform: {
              expression: transformExpr,
              ...(tagRename ? { 'tag-rename': tagRename } : {}),
            },
          }
        : {}),
    }
    return dumpConfigYaml({ rules: [rule] })
  }, [ruleName, match, action, priority, target, targets, transformExpr, tagRename])

  // ─── Context validation ──────────────────────────────────────────
  // Merges the rule into working config to catch cross-entity issues
  // (e.g., forward target references nonexistent transport).
  const contextValidation = useMemo(() => {
    if (!ruleName.trim() || !match.trim()) return null
    const rule: RuleConfig = {
      name: ruleName.trim(),
      match,
      action,
      priority,
      ...(action === 'forward' && target ? { target } : {}),
      ...(action === 'mirror' && targets.length > 0 ? { targets } : {}),
      ...(action === 'transform' && transformExpr
        ? {
            transform: {
              expression: transformExpr,
              ...(tagRename ? { 'tag-rename': tagRename } : {}),
            },
          }
        : {}),
    }
    return validateRuleInContext(workingConfig, rule)
  }, [ruleName, match, action, priority, target, targets, transformExpr, tagRename, workingConfig])

  const hasContextErrors = contextValidation !== null && !contextValidation.valid

  // ─── Step validation gates ───────────────────────────────────────
  const step0Valid = useMemo(() => {
    if (!ruleName.trim()) return false
    if (!isEdit && !isRuleNameUnique(ruleName.trim())) return false
    if (!match.trim()) return false
    return true
  }, [ruleName, match, isEdit, isRuleNameUnique])

  const step1Valid = action !== null

  const step2Valid = useMemo(() => {
    if (actionMeta.needsTarget === 'single') return !!target.trim()
    if (actionMeta.needsTarget === 'multi') return targets.length > 0
    if (actionMeta.needsTarget === 'transform') return !!transformExpr.trim()
    return true // drop, alert
  }, [actionMeta, target, targets, transformExpr])

  // ─── Save ────────────────────────────────────────────────────────
  const handleFinish = () => {
    if (!ruleName.trim() || !match.trim()) return
    const rule: RuleConfig = {
      name: ruleName.trim(),
      match: match.trim(),
      action,
      priority,
      ...(action === 'forward' && target.trim() ? { target: target.trim() } : {}),
      ...(action === 'mirror' && targets.length > 0 ? { targets } : {}),
      ...(action === 'transform' && transformExpr.trim()
        ? {
            transform: {
              expression: transformExpr.trim(),
              ...(tagRename.trim() ? { 'tag-rename': tagRename.trim() } : {}),
            },
          }
        : {}),
    }
    const ok = upsertRule(rule)
    if (ok) {
      onOpenChange(false)
      onSaved?.()
    }
  }

  // ─── Toggle a target in the mirror multi-select ──────────────────
  const toggleTarget = (name: string) => {
    setTargets((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }

  // ─── Build steps dynamically ─────────────────────────────────────
  const steps: WizardStep[] = [
    {
      id: 'basics',
      title: t('ruleWizard.stepBasics'),
      subtitle: t('ruleWizard.stepBasicsDesc'),
      canProceed: () => step0Valid,
      render: () => (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              {t('ruleWizard.ruleName')}
              <span className="text-destructive"> *</span>
            </Label>
            <Input
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="forward-to-cloud"
              disabled={isEdit}
            />
            {!isEdit && ruleName && !isRuleNameUnique(ruleName) && (
              <p className="text-xs text-destructive">{t('ruleWizard.nameExists')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              {t('ruleWizard.matchExpression')}
              <span className="text-destructive"> *</span>
            </Label>
            <Textarea
              value={match}
              onChange={(e) => setMatch(e.target.value)}
              placeholder='driver == "plc-modbus" && value > 50'
              rows={3}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {MATCH_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.value}
                  type="button"
                  onClick={() => setMatch(tpl.value)}
                  className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent font-mono text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">{t('ruleWizard.matchHelp')}</p>
            {/* Live expression syntax validation */}
            {(() => {
              const exprResult = validateRuleExpression(match)
              if (exprResult.valid && exprResult.warnings.length === 0) {
                return null
              }
              return (
                <div className="space-y-0.5">
                  {exprResult.errors.map((err, i) => (
                    <p
                      key={`e-${i}`}
                      className="text-[10px] text-destructive flex items-start gap-1"
                    >
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      {err}
                    </p>
                  ))}
                  {exprResult.warnings.map((warn, i) => (
                    <p
                      key={`w-${i}`}
                      className="text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1"
                    >
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      {warn}
                    </p>
                  ))}
                </div>
              )
            })()}
          </div>

          <div className="space-y-1.5">
            <Label>{t('ruleWizard.priority')}</Label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              min={0}
              className="w-24"
            />
            <p className="text-[10px] text-muted-foreground">{t('ruleWizard.priorityHelp')}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'action',
      title: t('ruleWizard.stepAction'),
      subtitle: t('ruleWizard.stepActionDesc'),
      canProceed: () => step1Valid,
      render: () => (
        <div className="space-y-2">
          {ACTION_META.map((meta) => (
            <label
              key={meta.action}
              htmlFor={`action-${meta.action}`}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                action === meta.action
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/40 hover:bg-accent/30',
              )}
            >
              <input
                type="radio"
                id={`action-${meta.action}`}
                name="rule-action"
                value={meta.action}
                checked={action === meta.action}
                onChange={() => setAction(meta.action)}
                className="h-4 w-4"
              />
              <span className="text-primary">{meta.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{t(meta.labelKey)}</div>
                <p className="text-[11px] text-muted-foreground">{t(meta.descKey)}</p>
              </div>
            </label>
          ))}
        </div>
      ),
    },
  ]

  // Conditionally add the target step (step 2) when needed
  if (needsTargetStep) {
    steps.push({
      id: 'target',
      title: t('ruleWizard.stepTarget'),
      subtitle:
        actionMeta.needsTarget === 'transform'
          ? t('ruleWizard.stepTransformDesc')
          : t('ruleWizard.stepTargetDesc'),
      canProceed: () => step2Valid,
      render: () => {
        if (actionMeta.needsTarget === 'single') {
          return (
            <div className="space-y-3">
              <Label>
                {t('ruleWizard.targetTransport')}
                <span className="text-destructive"> *</span>
              </Label>
              {transportNames.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  {t('ruleWizard.noTransports')}
                </div>
              ) : (
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={t('common.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {transportNames.map((name) => (
                      <SelectItem key={name} value={name} className="text-xs">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )
        }

        if (actionMeta.needsTarget === 'multi') {
          return (
            <div className="space-y-3">
              <Label>
                {t('ruleWizard.targetTransports')}
                <span className="text-destructive"> *</span>
              </Label>
              {transportNames.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  {t('ruleWizard.noTransports')}
                </div>
              ) : (
                <div className="space-y-1.5 rounded-md border p-3">
                  {transportNames.map((name) => (
                    <label
                      key={name}
                      htmlFor={`tgt-${name}`}
                      className="flex items-center gap-2.5 cursor-pointer rounded px-2 py-1.5 hover:bg-accent/40"
                    >
                      <Checkbox
                        id={`tgt-${name}`}
                        checked={targets.includes(name)}
                        onCheckedChange={() => toggleTarget(name)}
                      />
                      <span className="text-xs font-mono">{name}</span>
                    </label>
                  ))}
                </div>
              )}
              {targets.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {t('ruleWizard.selectedCount', { count: targets.length })}
                </p>
              )}
            </div>
          )
        }

        if (actionMeta.needsTarget === 'transform') {
          return (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  {t('ruleWizard.transformExpression')}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input
                  value={transformExpr}
                  onChange={(e) => setTransformExpr(e.target.value)}
                  placeholder="value * 1.8 + 32"
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('ruleWizard.transformExprHelp')}
                </p>
                {/* Live transform expression validation */}
                {(() => {
                  const exprResult = validateTransformExpression(transformExpr)
                  if (exprResult.valid && exprResult.warnings.length === 0) {
                    return null
                  }
                  return (
                    <div className="space-y-0.5">
                      {exprResult.errors.map((err, i) => (
                        <p
                          key={`te-${i}`}
                          className="text-[10px] text-destructive flex items-start gap-1"
                        >
                          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          {err}
                        </p>
                      ))}
                      {exprResult.warnings.map((warn, i) => (
                        <p
                          key={`tw-${i}`}
                          className="text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1"
                        >
                          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          {warn}
                        </p>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div className="space-y-1.5">
                <Label>{t('ruleWizard.tagRename')}</Label>
                <Input
                  value={tagRename}
                  onChange={(e) => setTagRename(e.target.value)}
                  placeholder="temperature_f"
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">{t('ruleWizard.tagRenameHelp')}</p>
              </div>
            </div>
          )
        }

        return null
      },
    })
  }

  // Always add the preview step (last)
  steps.push({
    id: 'preview',
    title: t('ruleWizard.stepPreview'),
    subtitle: t('ruleWizard.stepPreviewDesc'),
    render: () => (
      <div className="space-y-2">
        <div className="rounded-md border bg-muted/20 overflow-auto max-h-[200px]">
          <pre className="text-xs font-mono p-3 leading-relaxed">{previewYaml}</pre>
        </div>
        {contextValidation && (
          <div
            className={`rounded-md border p-2.5 text-xs space-y-1 ${
              hasContextErrors
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {hasContextErrors ? (
              <>
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {t('driverWizard.validationErrors', {
                    count: contextValidation.errors.length,
                  })}
                </div>
                <ul className="space-y-0.5 ml-5 list-disc">
                  {contextValidation.errors.slice(0, 6).map((err, i) => (
                    <li key={i} className="font-mono text-[10px] opacity-90">
                      {err.path}: {err.message}
                    </li>
                  ))}
                  {contextValidation.errors.length > 6 && (
                    <li className="text-[9px] opacity-70">
                      {t('driverWizard.validationMore', {
                        count: contextValidation.errors.length - 6,
                      })}
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('driverWizard.validationPassed')}
              </div>
            )}
          </div>
        )}
      </div>
    ),
  })

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      steps={steps}
      current={currentStep}
      onNext={(idx) => setCurrentStep(idx)}
      onPrevious={(idx) => setCurrentStep(idx)}
      onFinish={handleFinish}
      canFinish={!hasContextErrors}
      onCancel={() => onOpenChange(false)}
      dialogTitle={isEdit ? t('ruleWizard.editTitle') : t('ruleWizard.createTitle')}
      previewNode={
        <pre className="text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
          {previewYaml}
        </pre>
      }
    />
  )
}
