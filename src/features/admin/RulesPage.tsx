import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Loader2, Pencil, Play, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRules, useToggleRule, useUpdateConfig } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { formatNumber, isZeroTime } from '@/lib/utils'
import type { RuleStat } from '@/types/models'

// Targets serialize as `null` (not `[]`) when empty; prefer the multi-target
// list when present, otherwise fall back to the single `target` field.
const getTargetDisplay = (rule: RuleStat): string => {
  if (rule.targets && rule.targets.length > 0) {
    return rule.targets.join(', ')
  }
  return rule.target || '-'
}

interface SimDataPoint {
  driver: string
  device: string
  group: string
  tag: string
  value: string
  type: string
  quality: string
}

const EMPTY_TEST_DP: SimDataPoint = {
  driver: '',
  device: '',
  group: '',
  tag: '',
  value: '',
  type: 'float32',
  quality: '0',
}

const TEST_TYPE_OPTIONS: { value: string; label: string }[] = [
  'bool',
  'int8',
  'int16',
  'int32',
  'int64',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
  'float32',
  'float64',
  'string',
  'bytes',
].map((v) => ({ value: v, label: v }))

const getFieldValue = (dp: SimDataPoint, field: string): string | undefined => {
  switch (field) {
    case 'driver':
      return dp.driver
    case 'device':
      return dp.device
    case 'group':
      return dp.group
    case 'tag':
      return dp.tag
    case 'value':
      return dp.value
    case 'type':
      return dp.type
    case 'quality':
      return dp.quality
    default:
      return undefined
  }
}

// Naive client-side evaluator for simple match-DSL fragments.
// Supports: field == "lit" | field != "lit" | field >=|<=|>|< num |
// `field contains "lit"`, plus bare field names (truthy check), joined by
// `&&` / `||` (`&&` binds tighter). Anything unparseable is treated as a
// non-match so operators never get false positives. The dialog clearly labels
// the result as an estimate — full evaluation requires the CoreC engine.
const evaluateClause = (clause: string, dp: SimDataPoint): boolean => {
  const c = clause.trim()
  if (!c) return true

  const contains = c.match(/^(\w+)\s+contains\s+"([^"]*)"$/)
  if (contains) {
    const field = contains[1]!
    const lit = contains[2]!
    const v = getFieldValue(dp, field)
    if (v == null) return false
    return v.includes(lit)
  }

  const cmp = c.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*("[^"]*"|[\w.-]+)$/)
  if (cmp) {
    const field = cmp[1]!
    const op = cmp[2]!
    const raw = cmp[3]!
    const fv = getFieldValue(dp, field)
    if (fv === undefined) return false

    if (raw.startsWith('"')) {
      const lit = raw.slice(1, -1)
      if (op === '==') return fv === lit
      if (op === '!=') return fv !== lit
      return false
    }

    const lhs = Number(fv)
    const rhs = Number(raw)
    if (Number.isNaN(lhs) || Number.isNaN(rhs)) return false
    switch (op) {
      case '==':
        return lhs === rhs
      case '!=':
        return lhs !== rhs
      case '>':
        return lhs > rhs
      case '>=':
        return lhs >= rhs
      case '<':
        return lhs < rhs
      case '<=':
        return lhs <= rhs
      default:
        return false
    }
  }

  if (/^\w+$/.test(c)) {
    const v = getFieldValue(dp, c)
    return v != null && v !== ''
  }
  return false
}

const evaluateMatch = (match: string, dp: SimDataPoint): boolean => {
  const expr = match.trim()
  if (!expr) return true
  return expr
    .split('||')
    .some((orPart) => orPart.split('&&').every((andPart) => evaluateClause(andPart, dp)))
}

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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
)

// Rule editor form state — the editable subset of a RuleStat that the dialog
// binds to. Pre-filled from the selected rule on open.
interface EditFormData {
  name: string
  match: string
  action: RuleStat['action']
  target: string
  priority: number
}

// Action options for the editor's Select dropdown. The value is the wire
// format CoreC expects; the label is resolved via i18n at render time.
const EDIT_ACTION_OPTIONS: { value: RuleStat['action']; labelKey: string }[] = [
  { value: 'forward', labelKey: 'rules.edit.actionForward' },
  { value: 'drop', labelKey: 'rules.edit.actionDrop' },
  { value: 'alert', labelKey: 'rules.edit.actionAlert' },
  { value: 'transform', labelKey: 'rules.edit.actionTransform' },
  { value: 'mirror', labelKey: 'rules.edit.actionMirror' },
]

// Wrap a string as a YAML single-quoted scalar — internal single quotes are
// doubled. The match DSL may contain `&&`, `||`, comparisons and embedded
// quotes, none of which are safe as a bare YAML scalar.
const yamlScalar = (s: string): string => `'${s.replace(/'/g, "''")}'`

// Build the CoreC config YAML payload for the edited rule, in the format
// expected by PUT /configs (hot-reload).
const buildRuleYaml = (data: EditFormData): string =>
  [
    'rules:',
    `  - name: ${yamlScalar(data.name)}`,
    `    match: ${yamlScalar(data.match)}`,
    `    action: ${data.action}`,
    `    target: ${yamlScalar(data.target)}`,
    `    priority: ${data.priority}`,
  ].join('\n')

export const RulesPage: React.FC = () => {
  const { t } = useTranslation()
  const { data, refetch, isFetching, isLoading, isError, error } = useRules()
  const toggleMutation = useToggleRule()
  const updateMutation = useUpdateConfig()
  const queryClient = useQueryClient()

  const rules = data?.rules || []

  // Quality option labels are translated, so this is built inside the
  // component (where `t` is in scope) rather than at module load.
  const QUALITY_OPTIONS = useMemo(
    () =>
      [
        { value: '0', label: `0 — ${t('common.good')}` },
        { value: '1', label: `1 — ${t('common.bad')}` },
        { value: '2', label: `2 — ${t('common.uncertain')}` },
      ] as { value: string; label: string }[],
    [t],
  )

  // Track the specific rule being toggled so only that row's switch is
  // disabled while the mutation is in flight (not every switch on the page).
  const [togglingIndex, setTogglingIndex] = useState<number | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [testRule, setTestRule] = useState<RuleStat | null>(null)
  const [testDp, setTestDp] = useState<SimDataPoint>(EMPTY_TEST_DP)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [editRule, setEditRule] = useState<RuleStat | null>(null)
  const [editForm, setEditForm] = useState<EditFormData | null>(null)
  const [editStatus, setEditStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  const handleToggle = async (index: number, currentDisabled: boolean) => {
    setTogglingIndex(index)
    setToggleError(null)
    try {
      await toggleMutation.mutateAsync({ index, disabled: !currentDisabled })
    } catch (err) {
      // Catch prevents unhandled rejection; the switch reverts via the next
      // poll. Surface the error so the operator knows why.
      setToggleError(err instanceof Error ? err.message : t('rules.toggleFailed'))
    } finally {
      setTogglingIndex(null)
    }
  }

  const openTest = (rule: RuleStat) => {
    setTestRule(rule)
    setTestDp({ ...EMPTY_TEST_DP })
    setTestResult(null)
  }

  const closeTest = () => {
    setTestRule(null)
    setTestResult(null)
  }

  const runTest = () => {
    if (!testRule) return
    setTestResult(evaluateMatch(testRule.match, testDp))
  }

  const openEdit = (rule: RuleStat) => {
    setEditRule(rule)
    // Prefer the multi-target list's first entry when the single `target`
    // field is empty (CoreC serializes targets as null when empty).
    setEditForm({
      name: rule.name,
      match: rule.match,
      action: rule.action,
      target: (rule.target || rule.targets?.[0]) ?? '',
      priority: rule.priority,
    })
    setEditStatus(null)
  }

  const closeEdit = () => {
    setEditRule(null)
    setEditForm(null)
    setEditStatus(null)
  }

  const handleGenerateAndReload = async () => {
    if (!editForm) return
    setEditStatus(null)
    try {
      await updateMutation.mutateAsync({ payload: buildRuleYaml(editForm) })
      // PUT /configs hot-reloads the config; invalidate the rules list so the
      // table reflects the edited rule immediately rather than on next poll.
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      setEditStatus({ type: 'success', text: t('rules.edit.reloadSuccess') })
    } catch (err) {
      setEditStatus({
        type: 'error',
        text: err instanceof Error ? err.message : t('rules.edit.reloadFailed'),
      })
    }
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'alert':
        return (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
            {t('rules.actionAlert')}
          </Badge>
        )
      case 'drop':
        return (
          <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">
            {t('rules.actionDrop')}
          </Badge>
        )
      case 'transform':
        return (
          <Badge
            variant="outline"
            className="border-purple-500/30 bg-purple-500/10 text-purple-400"
          >
            {t('rules.actionTransform')}
          </Badge>
        )
      case 'mirror':
        return (
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            {t('rules.actionMirror')}
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400">
            {t('rules.actionForward')}
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      {toggleError && (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{toggleError}</span>
          <button
            type="button"
            onClick={() => setToggleError(null)}
            className="ml-auto text-rose-400/60 hover:text-rose-400"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('rules.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('rules.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 text-xs shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </Button>
      </div>

      <Card className="border-border/80 bg-card/60 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : isError ? (
          <div className="space-y-3 py-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <div className="text-sm font-semibold">{t('common.error')}</div>
            {error instanceof Error && error.message && (
              <div className="mx-auto max-w-md break-all font-mono text-[11px] text-rose-400/80">
                {error.message}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              {t('common.retry')}
            </Button>
          </div>
        ) : rules.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">{t('rules.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border/80 uppercase font-semibold text-[10px] text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-16">{t('rules.colPriority')}</th>
                  <th className="px-4 py-3">{t('rules.colName')}</th>
                  <th className="px-4 py-3">{t('rules.colMatch')}</th>
                  <th className="px-4 py-3">{t('rules.colAction')}</th>
                  <th className="px-4 py-3">{t('rules.colTarget')}</th>
                  <th className="px-4 py-3">{t('rules.colHitStats')}</th>
                  <th className="px-4 py-3 text-right">{t('rules.colEnabled')}</th>
                  <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rules.map((rule) => {
                  return (
                    <tr
                      key={rule.index}
                      className={`hover:bg-muted/30 transition-colors ${
                        rule.disabled ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-muted-foreground">
                        #{rule.priority}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{rule.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {rule.type}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="px-2 py-1 rounded bg-muted/60 text-[11px] font-mono text-primary border border-border/50">
                          {rule.match}
                        </code>
                      </td>
                      <td className="px-4 py-3">{getActionBadge(rule.action)}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {getTargetDisplay(rule)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2 text-[11px]">
                          <span className="text-emerald-400 font-mono font-bold">
                            {formatNumber(rule.hit_count)} {t('common.hits')}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground font-mono">
                            {formatNumber(rule.miss_count)}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t('rules.last')}:{' '}
                          {isZeroTime(rule.hit_at)
                            ? t('common.never')
                            : new Date(rule.hit_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Switch
                          checked={!rule.disabled}
                          onCheckedChange={() => handleToggle(rule.index, rule.disabled)}
                          disabled={togglingIndex === rule.index}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openTest(rule)}
                            className="h-7 text-[11px]"
                          >
                            <Play className="w-3 h-3 mr-1" />
                            {t('rules.test')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(rule)}
                            className="h-7 text-[11px]"
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            {t('common.edit')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
              <code className="block px-3 py-2 rounded bg-muted/60 text-[11px] font-mono text-primary border border-border/50 break-all">
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
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-rose-500/30 bg-rose-500/10'
                }`}
              >
                {testResult ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-emerald-400">{t('rules.matched')}</div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground">{t('common.action')}:</span>
                      {getActionBadge(testRule.action)}
                    </div>
                    <div className="text-[11px] font-mono">
                      <span className="text-muted-foreground">{t('common.target')}:</span>{' '}
                      <span className="text-foreground">{getTargetDisplay(testRule)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs font-bold text-rose-400">{t('rules.noMatch')}</div>
                )}
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
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
                  onValueChange={(v) =>
                    setEditForm({ ...editForm, action: v as RuleStat['action'] })
                  }
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
                <LabeledInput
                  label={t('rules.edit.target')}
                  value={editForm.target}
                  onChange={(v) => setEditForm({ ...editForm, target: v })}
                />
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

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">
                  {t('config.yamlCode')}
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border border-border/50 bg-muted/60 p-3 text-[11px] font-mono text-primary whitespace-pre-wrap break-all">
                  {buildRuleYaml(editForm)}
                </pre>
              </div>

              {editStatus && (
                <div
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                    editStatus.type === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
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
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              {t('common.close')}
            </Button>
            <Button
              onClick={handleGenerateAndReload}
              disabled={!editForm || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              {t('rules.edit.generateAndReload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
