import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Loader2, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw, useRules, useToggleRule, useUpdateConfig } from '@/api/hooks'
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
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { EntitySearchBar, filterEntities } from '@/components/wizard/EntitySearchBar'
import { UnsavedChangesBanner } from '@/components/wizard/UnsavedChangesBanner'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { RuleWizard } from '@/features/admin/RuleWizard'
import { formatValidationErrors, useConfigValidation } from '@/hooks/useConfigValidation'
import { parseConfigYaml } from '@/lib/configYaml'
import { evaluateMatch, type SimDataPoint } from '@/lib/ruleMatchEvaluator'
import { buildRuleYaml, type EditFormData } from '@/lib/ruleYaml'
import { formatNumber, formatRelativeTime, isZeroTime } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import { DATA_TYPES, type RuleConfig } from '@/types/config'
import type { RuleStat } from '@/types/models'

// Targets serialize as `null` (not `[]`) when empty; prefer the multi-target
// list when present, otherwise fall back to the single `target` field.
const getTargetDisplay = (rule: RuleStat): string => {
  if (rule.targets && rule.targets.length > 0) {
    return rule.targets.join(', ')
  }
  return rule.target || '-'
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

const TEST_TYPE_OPTIONS: { value: string; label: string }[] = DATA_TYPES.map((v) => ({
  value: v,
  label: v,
}))

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

// Rule editor form state — the editable subset of a RuleStat that the dialog
// binds to. Pre-filled from the selected rule on open. Transform fields are
// only relevant when action === 'transform'; `targets` (comma-separated) is
// only relevant when action === 'mirror'.
// Action options for the editor's Select dropdown. The value is the wire
// format CoreC expects; the label is resolved via i18n at render time.
const EDIT_ACTION_OPTIONS: { value: RuleStat['action']; labelKey: string }[] = [
  { value: 'forward', labelKey: 'rules.edit.actionForward' },
  { value: 'drop', labelKey: 'rules.edit.actionDrop' },
  { value: 'alert', labelKey: 'rules.edit.actionAlert' },
  { value: 'transform', labelKey: 'rules.edit.actionTransform' },
  { value: 'mirror', labelKey: 'rules.edit.actionMirror' },
]

export const RulesPage: React.FC = () => {
  const { t } = useTranslation()
  const { data, refetch, isFetching, isLoading, isError, error } = useRules()
  const toggleMutation = useToggleRule()
  const updateMutation = useUpdateConfig()
  const queryClient = useQueryClient()
  // Raw config YAML — used to pre-fill transform config for transform rules,
  // since the runtime RuleStat does not include transform fields.
  const { data: rawConfigYaml } = useConfigRaw()

  const rules = data?.rules || []

  // Config editing state (configStore)
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const dirty = useConfigStore((s) => s.dirty)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const removeRule = useConfigStore((s) => s.removeRule)
  const findRule = useConfigStore((s) => s.findRule)
  const getWorkingYaml = useConfigStore((s) => s.getWorkingYaml)
  const getSavedYaml = useConfigStore((s) => s.getSavedYaml)
  const markSaved = useConfigStore((s) => s.markSaved)
  const validation = useConfigValidation()
  const validationErrors = formatValidationErrors(validation)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RuleConfig | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const configRules = workingConfig?.rules ?? []
  const filteredConfigRules = filterEntities(configRules, searchQuery)

  const handleCreateRule = () => {
    if (!workingConfig) resetToEmpty()
    setEditingRule(undefined)
    setWizardOpen(true)
  }

  const handleEditRule = (name: string) => {
    const rl = findRule(name)
    if (!rl) return
    setEditingRule(rl)
    setWizardOpen(true)
  }

  const confirmDeleteRule = () => {
    if (deleteTarget) {
      removeRule(deleteTarget)
      setDeleteTarget(null)
    }
  }

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

  // Track the specific rules being toggled so only those rows' switches are
  // disabled while mutations are in flight (not every switch on the page).
  // Uses a Set so multiple rules can toggle concurrently without one's
  // completion clearing another's in-flight state. [M-5]
  const [togglingIndices, setTogglingIndices] = useState<Set<number>>(new Set())
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
    setTogglingIndices((prev) => new Set(prev).add(index))
    setToggleError(null)
    try {
      await toggleMutation.mutateAsync({ index, disabled: !currentDisabled })
    } catch (err) {
      // Catch prevents unhandled rejection; the switch reverts via the next
      // poll. Surface the error so the operator knows why.
      setToggleError(err instanceof Error ? err.message : t('rules.toggleFailed'))
    } finally {
      setTogglingIndices((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
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
    const singleTarget = (rule.target || rule.targets?.[0]) ?? ''
    const targetsCsv =
      rule.targets && rule.targets.length > 0 ? rule.targets.join(', ') : singleTarget

    // Transform config is not part of the runtime RuleStat; look it up in the
    // raw config YAML so the editor pre-fills the existing expression/tag-rename
    // instead of blanking them on save.
    let transformExpression = ''
    let transformTagRename = ''
    if (rule.action === 'transform' && rawConfigYaml) {
      try {
        const cfg = parseConfigYaml(rawConfigYaml)
        const rl = cfg.rules?.find((r) => r.name === rule.name)
        if (rl?.transform) {
          transformExpression = rl.transform.expression ?? ''
          transformTagRename = rl.transform['tag-rename'] ?? ''
        }
      } catch {
        // Ignore parse errors — fall back to empty transform fields.
      }
    }

    setEditForm({
      name: rule.name,
      match: rule.match,
      action: rule.action,
      target: singleTarget,
      targets: targetsCsv,
      priority: rule.priority,
      transformExpression,
      transformTagRename,
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
          <Badge
            variant="outline"
            className="border-status-warning/30 bg-status-warning/10 text-status-warning"
          >
            {t('rules.actionAlert')}
          </Badge>
        )
      case 'drop':
        return (
          <Badge
            variant="outline"
            className="border-status-error/30 bg-status-error/10 text-status-error"
          >
            {t('rules.actionDrop')}
          </Badge>
        )
      case 'transform':
        return (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {t('rules.actionTransform')}
          </Badge>
        )
      case 'mirror':
        return (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {t('rules.actionMirror')}
          </Badge>
        )
      default:
        return (
          <Badge
            variant="outline"
            className="border-status-queued/30 bg-status-queued/10 text-status-queued"
          >
            {t('rules.actionForward')}
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-5">
      {toggleError && (
        <div className="flex items-center gap-2 rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{toggleError}</span>
          <button
            type="button"
            onClick={() => setToggleError(null)}
            aria-label="Dismiss"
            className="ml-auto text-status-error/60 hover:text-status-error"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('rules.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('rules.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setApplyError(null)
                setApplyDialogOpen(true)
              }}
              disabled={!!validationErrors}
              className="h-8 text-xs shrink-0"
            >
              {t('rules.applyChanges')}
            </Button>
          )}
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
          <Button
            variant="default"
            size="sm"
            onClick={handleCreateRule}
            className="h-8 text-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>{t('rules.createRule')}</span>
          </Button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      <UnsavedChangesBanner
        dirty={dirty}
        unsavedChangesLabel={t('rules.unsavedChanges')}
        applyChangesLabel={t('rules.applyChanges')}
        hasValidationErrors={!!validationErrors}
        onApply={() => {
          setApplyError(null)
          setApplyDialogOpen(true)
        }}
        onDiscard={() => useConfigStore.getState().revert()}
      />

      {/* Live validation errors */}
      <ValidationBanner />

      {/* Config-managed rules section */}
      {configRules.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('rules.configSection')}
            </h2>
            <Badge variant="outline" className="text-xs">
              {configRules.length}
            </Badge>
            {configRules.length > 6 && (
              <EntitySearchBar value={searchQuery} onChange={setSearchQuery} />
            )}
          </div>
          {searchQuery && filteredConfigRules.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {t('common.noResults', { query: searchQuery }) || `No results for "${searchQuery}"`}
            </p>
          )}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-xs text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-3 py-2 w-12">{t('rules.colPriority')}</th>
                  <th className="px-3 py-2">{t('rules.colName')}</th>
                  <th className="px-3 py-2">{t('rules.colMatch')}</th>
                  <th className="px-3 py-2">{t('rules.colAction')}</th>
                  <th className="px-3 py-2">{t('rules.colTarget')}</th>
                  <th className="px-3 py-2 w-20 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredConfigRules.map((rl) => (
                  <tr key={rl.name} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono">{rl.priority ?? 100}</td>
                    <td className="px-3 py-2 font-semibold">{rl.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                      {rl.match}
                    </td>
                    <td className="px-3 py-2">{getActionBadge(rl.action)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {rl.targets?.join(', ') || rl.target || '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditRule(rl.name)}
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                          title={t('common.edit')}
                          aria-label={t('common.edit')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(rl.name)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Runtime rules section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t('rules.runtimeSection')}
          </h2>
          <Badge variant="outline" className="text-xs">
            {rules.length}
          </Badge>
        </div>
        <Card className="border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : isError ? (
            <div className="space-y-3 py-10 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-status-error" />
              <div className="text-sm font-semibold">{t('common.error')}</div>
              {error instanceof Error && error.message && (
                <div className="mx-auto max-w-md break-all font-mono text-xs text-status-error/80">
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
            <div className="py-10 text-center text-xs text-muted-foreground">
              {t('rules.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b border-border uppercase font-semibold text-xs text-muted-foreground tracking-wider">
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
                          <div className="text-xs text-muted-foreground font-mono">{rule.type}</div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="px-2 py-1 rounded bg-muted/60 text-xs font-mono text-primary border border-border">
                            {rule.match}
                          </code>
                        </td>
                        <td className="px-4 py-3">{getActionBadge(rule.action)}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {getTargetDisplay(rule)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="text-status-running font-mono font-bold">
                              {formatNumber(rule.hit_count)} {t('common.hits')}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-muted-foreground font-mono">
                              {formatNumber(rule.miss_count)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t('rules.last')}:{' '}
                            {isZeroTime(rule.hit_at)
                              ? t('common.never')
                              : new Date(rule.hit_at).toLocaleTimeString()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t('rules.lastMiss')}:{' '}
                            {isZeroTime(rule.miss_at)
                              ? t('common.never')
                              : formatRelativeTime(rule.miss_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Switch
                            checked={!rule.disabled}
                            onCheckedChange={() => handleToggle(rule.index, rule.disabled)}
                            disabled={togglingIndices.has(rule.index)}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openTest(rule)}
                              className="h-7 text-xs"
                            >
                              <Play className="w-3 h-3 mr-1" />
                              {t('rules.test')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(rule)}
                              className="h-7 text-xs"
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
      </div>

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
                    <div className="text-xs font-bold text-status-running">
                      {t('rules.matched')}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{t('common.action')}:</span>
                      {getActionBadge(testRule.action)}
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

      {/* Rule create/edit wizard */}
      <RuleWizard open={wizardOpen} onOpenChange={setWizardOpen} existingRule={editingRule} />

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rules.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('rules.deleteConfirm', { name: deleteTarget ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply changes confirmation */}
      <ConfigApplyConfirmationDialog
        open={applyDialogOpen}
        onOpenChange={(v) => {
          setApplyDialogOpen(v)
          if (!v) setApplyError(null)
        }}
        beforeYaml={getSavedYaml() ?? ''}
        afterYaml={getWorkingYaml() ?? ''}
        applying={updateMutation.isPending}
        validationErrors={validationErrors}
        applyError={applyError ?? undefined}
        onConfirm={() => {
          if (validationErrors) return
          const yaml = getWorkingYaml() ?? ''
          setApplyError(null)
          updateMutation.mutate(
            { payload: yaml },
            {
              onSuccess: () => {
                markSaved()
                setApplyDialogOpen(false)
                queryClient.invalidateQueries({ queryKey: ['rules'] })
              },
              onError: (err) => setApplyError(err instanceof Error ? err.message : String(err)),
            },
          )
        }}
      />
    </div>
  )
}
