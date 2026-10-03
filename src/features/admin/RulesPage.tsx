import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw, useRules, useUpdateConfig } from '@/api/hooks'
import {
  ActionBadge,
  EMPTY_TEST_DP,
  getTargetDisplay,
  RuleEditDialog,
  RuleTestDialog,
} from '@/components/admin/RuleParts'
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
import { Switch } from '@/components/ui/switch'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { EntitySearchBar, filterEntities } from '@/components/wizard/EntitySearchBar'
import { UnsavedChangesBanner } from '@/components/wizard/UnsavedChangesBanner'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { RuleWizard } from '@/features/admin/RuleWizard'
import { useApplyConfig } from '@/hooks/useApplyConfig'
import { formatValidationErrors, useConfigValidation } from '@/hooks/useConfigValidation'
import { useEntityListPage } from '@/hooks/useEntityListPage'
import { useRuleToggle } from '@/hooks/useRuleToggle'
import { parseConfigYaml } from '@/lib/configYaml'
import { formatRelativeTime } from '@/lib/formatters'
import { evaluateMatch, type SimDataPoint } from '@/lib/ruleMatchEvaluator'
import { buildRuleYaml, type EditFormData } from '@/lib/ruleYaml'
import { formatNumber, isZeroTime } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import type { RuleConfig } from '@/types/config'
import type { RuleStat } from '@/types/models'

export const RulesPage: React.FC = () => {
  const { t } = useTranslation()
  const { data, refetch, isFetching, isLoading, isError, error } = useRules()
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

  const [searchQuery, setSearchQuery] = useState('')

  const { openDialog: openApplyDialog, dialogProps: applyDialogProps } = useApplyConfig({
    getWorkingYaml,
    getSavedYaml,
    markSaved,
    validationErrors,
    onApplySuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  })

  const {
    wizardOpen,
    setWizardOpen,
    editing: editingRule,
    deleteTarget,
    setDeleteTarget,
    handleCreate: handleCreateRule,
    handleEdit: handleEditRule,
    confirmDelete: confirmDeleteRule,
  } = useEntityListPage<RuleConfig>({
    find: findRule,
    remove: removeRule,
    resetToEmpty,
    hasWorkingConfig: !!workingConfig,
  })

  const configRules = workingConfig?.rules ?? []
  const filteredConfigRules = filterEntities(configRules, searchQuery)

  // Track the specific rules being toggled so only those rows' switches are
  // disabled while mutations are in flight (not every switch on the page).
  // Uses a Set so multiple rules can toggle concurrently without one's
  // Per-row toggle in-flight tracking + error surface. [M-5]
  const { togglingIndices, toggleError, handleToggle, clearToggleError } = useRuleToggle()
  const [testRule, setTestRule] = useState<RuleStat | null>(null)
  const [testDp, setTestDp] = useState<SimDataPoint>(EMPTY_TEST_DP)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [editRule, setEditRule] = useState<RuleStat | null>(null)
  const [editForm, setEditForm] = useState<EditFormData | null>(null)
  const [editStatus, setEditStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

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

  return (
    <div className="space-y-5">
      {toggleError && (
        <div className="flex items-center gap-2 rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{toggleError}</span>
          <button
            type="button"
            onClick={clearToggleError}
            aria-label={t('common.close')}
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
              onClick={() => openApplyDialog()}
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
        onApply={() => openApplyDialog()}
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
                    <td className="px-3 py-2">
                      <ActionBadge action={rl.action} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {rl.targets?.join(', ') || rl.target || '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditRule(rl.name)}
                          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                          title={t('common.edit')}
                          aria-label={t('common.edit')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(rl.name)}
                          className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
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
                        <td className="px-4 py-3">
                          <ActionBadge action={rule.action} />
                        </td>
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
                              : formatRelativeTime(rule.miss_at, t)}
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
                              className="h-9 text-xs"
                            >
                              <Play className="w-3 h-3 mr-1" />
                              {t('rules.test')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(rule)}
                              className="h-9 text-xs"
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

      <RuleTestDialog
        testRule={testRule}
        testDp={testDp}
        setTestDp={setTestDp}
        testResult={testResult}
        closeTest={closeTest}
        runTest={runTest}
      />

      <RuleEditDialog
        editRule={editRule}
        editForm={editForm}
        setEditForm={setEditForm}
        editStatus={editStatus}
        closeEdit={closeEdit}
        handleGenerateAndReload={handleGenerateAndReload}
        isPending={updateMutation.isPending}
      />

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
      <ConfigApplyConfirmationDialog {...applyDialogProps} />
    </div>
  )
}
