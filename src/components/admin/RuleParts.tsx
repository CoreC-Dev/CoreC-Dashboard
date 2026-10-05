import { AlertCircle, Check, Loader2, Play, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SimDataPoint } from '@/lib/ruleMatchEvaluator'
import { buildRuleYaml, type EditFormData } from '@/lib/ruleYaml'
import { DATA_TYPES } from '@/types/config'
import type { RuleStat } from '@/types/models'

// ─── Shared helpers ─────────────────────────────────────────

/** Targets serialize as `null` (not `[]`) when empty; prefer the multi-target
 *  list when present, otherwise fall back to the single `target` field. */
export const getTargetDisplay = (rule: RuleStat): string => {
  if (rule.targets && rule.targets.length > 0) {
    return rule.targets.join(', ')
  }
  return rule.target || '-'
}

export const EMPTY_TEST_DP: SimDataPoint = {
  driver: '',
  device: '',
  group: '',
  tag: '',
  value: '',
  type: 'float32',
  quality: '0',
}

const TEST_TYPE_OPTIONS: { value: string; label: string }[] = DATA_TYPES.map((v) => ({
  value: v,
  label: v,
}))

const EDIT_ACTION_OPTIONS: { value: RuleStat['action']; labelKey: string }[] = [
  { value: 'forward', labelKey: 'rules.edit.actionForward' },
  { value: 'drop', labelKey: 'rules.edit.actionDrop' },
  { value: 'alert', labelKey: 'rules.edit.actionAlert' },
  { value: 'transform', labelKey: 'rules.edit.actionTransform' },
  { value: 'mirror', labelKey: 'rules.edit.actionMirror' },
]

const LabeledInput: React.FC<{
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}> = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-foreground">{label}</label>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 text-xs"
    />
  </div>
)

const LabeledSelect: React.FC<{
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}> = ({ label, value, onChange, options }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-foreground">{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="font-mono">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="font-mono">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)

// ─── ActionBadge ────────────────────────────────────────────

const ACTION_BADGE_META: Record<string, { cls: string; key: string }> = {
  alert: {
    cls: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
    key: 'rules.actionAlert',
  },
  drop: {
    cls: 'border-status-error/30 bg-status-error/10 text-status-error',
    key: 'rules.actionDrop',
  },
  transform: {
    cls: 'border-primary/30 bg-primary/10 text-primary',
    key: 'rules.actionTransform',
  },
  mirror: {
    cls: 'border-primary/30 bg-primary/10 text-primary',
    key: 'rules.actionMirror',
  },
  default: {
    cls: 'border-status-queued/30 bg-status-queued/10 text-status-queued',
    key: 'rules.actionForward',
  },
}

export const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const { t } = useTranslation()
  const meta = ACTION_BADGE_META[action] ?? ACTION_BADGE_META.default
  return (
    <Badge variant="outline" className={meta.cls}>
      {t(meta.key)}
    </Badge>
  )
}

// ─── RuleTestDialog ─────────────────────────────────────────

interface RuleTestDialogProps {
  testRule: RuleStat | null
  testDp: SimDataPoint
  setTestDp: React.Dispatch<React.SetStateAction<SimDataPoint>>
  testResult: boolean | null
  closeTest: () => void
  runTest: () => void
}

export const RuleTestDialog: React.FC<RuleTestDialogProps> = ({
  testRule,
  testDp,
  setTestDp,
  testResult,
  closeTest,
  runTest,
}) => {
  const { t } = useTranslation()
  const QUALITY_OPTIONS = useMemo(
    () =>
      [
        { value: '0', label: `0 — ${t('common.good')}` },
        { value: '1', label: `1 — ${t('common.bad')}` },
        { value: '2', label: `2 — ${t('common.uncertain')}` },
      ] as { value: string; label: string }[],
    [t],
  )

  return (
    <Dialog open={testRule !== null} onOpenChange={(o) => !o && closeTest()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('rules.testRule', { name: testRule?.name })}</DialogTitle>
          <DialogDescription>{t('rules.testDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">
              {t('rules.matchExpression')}
            </div>
            <code className="block px-3 py-2 rounded bg-muted/60 text-xs font-mono text-primary border border-border break-all">
              {testRule?.match || t('rules.emptyMatch')}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label={t('common.driver')}
              value={testDp.driver}
              onChange={(v) => setTestDp({ ...testDp, driver: v })}
              placeholder={t('rules.phDriver')}
            />
            <LabeledInput
              label={t('common.device')}
              value={testDp.device}
              onChange={(v) => setTestDp({ ...testDp, device: v })}
              placeholder={t('rules.phDevice')}
            />
            <LabeledInput
              label={t('common.group')}
              value={testDp.group}
              onChange={(v) => setTestDp({ ...testDp, group: v })}
              placeholder={t('rules.phGroup')}
            />
            <LabeledInput
              label={t('common.tag')}
              value={testDp.tag}
              onChange={(v) => setTestDp({ ...testDp, tag: v })}
              placeholder={t('rules.phTag')}
            />
            <LabeledInput
              label={t('common.value')}
              value={testDp.value}
              onChange={(v) => setTestDp({ ...testDp, value: v })}
              placeholder={t('rules.phValue')}
            />
            <LabeledSelect
              label={t('common.type')}
              value={testDp.type}
              onChange={(v) => setTestDp({ ...testDp, type: v })}
              options={TEST_TYPE_OPTIONS}
            />
            <LabeledSelect
              label={t('common.quality')}
              value={testDp.quality}
              onChange={(v) => setTestDp({ ...testDp, quality: v })}
              options={QUALITY_OPTIONS}
            />
          </div>

          {testRule && testResult !== null && (
            <div
              className={`rounded-lg border p-3 space-y-2 ${
                testResult
                  ? 'border-status-running/30 bg-status-running/10'
                  : 'border-status-error/30 bg-status-error/10'
              }`}
            >
              {testResult ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-status-running">{t('rules.matched')}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t('common.action')}:</span>
                    <ActionBadge action={testRule.action} />
                  </div>
                  <div className="text-xs font-mono">
                    <span className="text-muted-foreground">{t('common.target')}:</span>{' '}
                    <span className="text-foreground">{getTargetDisplay(testRule)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs font-bold text-status-error">{t('rules.noMatch')}</div>
              )}
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                {t('rules.testNote')}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeTest}>
            {t('common.close')}
          </Button>
          <Button onClick={runTest} disabled={!testRule}>
            <Play className="w-3.5 h-3.5 mr-1.5" />
            {t('rules.runTest')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── RuleEditDialog ─────────────────────────────────────────

interface RuleEditDialogProps {
  editRule: RuleStat | null
  editForm: EditFormData | null
  setEditForm: React.Dispatch<React.SetStateAction<EditFormData | null>>
  editStatus: { type: 'success' | 'error'; text: string } | null
  closeEdit: () => void
  handleGenerateAndReload: () => void
  isPending: boolean
  editFormErrors: string[] | undefined
  editConfirmOpen: boolean
  setEditConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export const RuleEditDialog: React.FC<RuleEditDialogProps> = ({
  editRule,
  editForm,
  setEditForm,
  editStatus,
  closeEdit,
  handleGenerateAndReload,
  isPending,
  editFormErrors,
  editConfirmOpen,
  setEditConfirmOpen,
}) => {
  const { t } = useTranslation()

  return (
    <Dialog open={editRule !== null} onOpenChange={(o) => !o && closeEdit()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('rules.edit.title')}</DialogTitle>
          <DialogDescription>{t('rules.subtitle')}</DialogDescription>
        </DialogHeader>

        {editForm && (
          <div className="space-y-4">
            <LabeledInput
              label={t('rules.edit.name')}
              value={editForm.name}
              onChange={(v) => setEditForm({ ...editForm, name: v })}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {t('rules.edit.match')}
              </label>
              <textarea
                value={editForm.match}
                onChange={(e) => setEditForm({ ...editForm, match: e.target.value })}
                placeholder={t('rules.edit.matchPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {t('rules.edit.action')}
              </label>
              <Select
                value={editForm.action}
                onValueChange={(v) => setEditForm({ ...editForm, action: v as RuleStat['action'] })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDIT_ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {t(o.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {editForm.action === 'mirror' ? (
                <LabeledInput
                  label={t('rules.edit.targets')}
                  value={editForm.targets}
                  onChange={(v) => setEditForm({ ...editForm, targets: v })}
                  placeholder={t('rules.edit.targetsPlaceholder')}
                />
              ) : (
                <LabeledInput
                  label={t('rules.edit.target')}
                  value={editForm.target}
                  onChange={(v) => setEditForm({ ...editForm, target: v })}
                />
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {t('rules.edit.priority')}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={editForm.priority}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (!Number.isNaN(n)) setEditForm({ ...editForm, priority: n })
                  }}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {editForm.action === 'transform' && (
              <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                <LabeledInput
                  label={t('rules.edit.transformExpression')}
                  value={editForm.transformExpression}
                  onChange={(v) => setEditForm({ ...editForm, transformExpression: v })}
                  placeholder={t('rules.edit.transformExpressionPlaceholder')}
                />
                <LabeledInput
                  label={t('rules.edit.transformTagRename')}
                  value={editForm.transformTagRename}
                  onChange={(v) => setEditForm({ ...editForm, transformTagRename: v })}
                  placeholder={t('rules.edit.transformTagRenamePlaceholder')}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground">
                {t('config.yamlCode')}
              </div>
              <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/60 p-3 text-xs font-mono text-primary whitespace-pre-wrap break-all">
                {buildRuleYaml(editForm)}
              </pre>
            </div>

            {editStatus && (
              <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                  editStatus.type === 'success'
                    ? 'border-status-running/30 bg-status-running/10 text-status-running'
                    : 'border-status-error/30 bg-status-error/10 text-status-error'
                }`}
              >
                {editStatus.type === 'error' ? (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <Check className="h-4 w-4 shrink-0" />
                )}
                <span className="break-all">{editStatus.text}</span>
              </div>
            )}

            {/* Local validation errors */}
            {editFormErrors && editFormErrors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive space-y-1">
                {editFormErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {err}
                  </div>
                ))}
              </div>
            )}

            {/* Confirmation step before PUT /configs */}
            {editConfirmOpen && (
              <div className="rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs space-y-3">
                <div className="flex items-start gap-2 text-status-warning">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{t('rules.edit.confirmWarning')}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditConfirmOpen(false)}
                    disabled={isPending}
                    className="h-8 text-xs"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleGenerateAndReload}
                    disabled={isPending}
                    className="h-8 text-xs"
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {t('rules.edit.confirmApply')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={closeEdit}>
            {t('common.close')}
          </Button>
          <Button
            onClick={() => setEditConfirmOpen(true)}
            disabled={!editForm || isPending || !!editFormErrors || editConfirmOpen}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            {t('rules.edit.generateAndReload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
