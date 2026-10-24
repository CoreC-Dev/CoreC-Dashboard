import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigRaw, useRules } from '@/api/hooks'
import { DeleteEntityConfirm } from '@/components/admin/DeleteEntityConfirm'
import {
  ActionBadge,
  ContinueBadge,
  getTargetDisplay,
  RuleTestDialog,
} from '@/components/admin/RuleParts'
import { RuntimeRulesTable } from '@/components/admin/RuntimeRulesTable'
import { SeedBlockedBanner } from '@/components/admin/SeedBlockedBanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { EntitySearchBar, filterEntities } from '@/components/wizard/EntitySearchBar'
import { UnsavedChangesBanner } from '@/components/wizard/UnsavedChangesBanner'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { RuleWizard } from '@/features/admin/RuleWizard'
import { useApplyConfig } from '@/hooks/useApplyConfig'
import { useAutoLoadConfig } from '@/hooks/useAutoLoadConfig'
import {
  formatValidationErrors,
  formatValidationWarnings,
  useConfigValidation,
} from '@/hooks/useConfigValidation'
import { useEntityListPage } from '@/hooks/useEntityListPage'
import { useRuleToggle } from '@/hooks/useRuleToggle'
import { parseConfigYaml } from '@/lib/configYaml'
import { useConfigStore } from '@/stores/configStore'
import type { RuleConfig } from '@/types/config'
import type { RuleStat } from '@/types/models'

export const RulesPage: React.FC = () => {
  const { t } = useTranslation()
  const { data, refetch, isFetching, isLoading, isError, error } = useRules()
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
  const validationWarnings = formatValidationWarnings(validation)

  const [searchQuery, setSearchQuery] = useState('')

  const { openDialog: openApplyDialog, dialogProps: applyDialogProps } = useApplyConfig({
    getWorkingYaml,
    getSavedYaml,
    markSaved,
    validationErrors,
    validationWarnings,
    onApplySuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  })

  // Create stays disabled (and the block visible) while the
  // server config has never been loaded.
  const { seedBlocked } = useAutoLoadConfig()

  const {
    wizardOpen,
    setWizardOpen,
    editing: editingRule,
    setEditing,
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

  // The runtime table gets the same search affordance as the config
  // section (name/match/target) plus a clickable priority sort — hundreds of
  // live rules otherwise need Ctrl+F to find one tag's rule.
  const [runtimeSearch, setRuntimeSearch] = useState('')
  const [runtimeSortDesc, setRuntimeSortDesc] = useState(false)
  const filteredRuntimeRules = filterEntities(
    rules,
    runtimeSearch,
    (r) => `${r.match} ${getTargetDisplay(r)}`,
  )
  const visibleRuntimeRules = runtimeSortDesc
    ? [...filteredRuntimeRules].sort((a, b) => b.priority - a.priority)
    : filteredRuntimeRules

  // Track the specific rules being toggled so only those rows' switches are
  // disabled while mutations are in flight (not every switch on the page).
  // Uses a Set so multiple rules can toggle concurrently without one's
  // Per-row toggle in-flight tracking + error surface.
  const { togglingNames, toggleError, handleToggle, clearToggleError } = useRuleToggle()
  const [testRule, setTestRule] = useState<RuleStat | null>(null)

  // The dialog owns its sample-point state and talks to the
  // server's scratch engine itself — RulesPage only tracks which rule
  // is under test.
  const openTest = (rule: RuleStat) => setTestRule(rule)
  const closeTest = () => setTestRule(null)

  // The runtime row's Edit opens the SAME RuleWizard the config
  // section uses, so a rule has ONE editor with ONE (delayed-apply)
  // semantics — the wizard writes into the working config and the change
  // only reaches the engine through the shared apply-confirmation dialog.
  // The old RuleEditDialog fired PUT /configs directly (and with a
  // rules-only payload, which REPLACED the whole config).
  const openRuntimeRuleInWizard = (rule: RuleStat) => {
    const inWorking = findRule(rule.name)
    if (inWorking) {
      setEditing(inWorking)
      setWizardOpen(true)
      return
    }
    // Not in the working config (store still loading, or removed pending
    // apply): fall back to the SAVED config's version of the rule, then
    // to a minimal draft built from the runtime stat.
    let fromSaved: RuleConfig | undefined
    if (rawConfigYaml) {
      try {
        fromSaved = parseConfigYaml(rawConfigYaml).rules?.find((r) => r.name === rule.name)
      } catch {
        // Ignore parse errors — fall through to the runtime-stat draft.
      }
    }
    if (!workingConfig) resetToEmpty()
    setEditing(
      fromSaved ?? {
        name: rule.name,
        match: rule.match,
        action: rule.action,
        priority: rule.priority,
        ...(rule.target ? { target: rule.target } : {}),
        ...(rule.targets && rule.targets.length > 0 ? { targets: rule.targets } : {}),
      },
    )
    setWizardOpen(true)
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
            disabled={seedBlocked}
            className="h-8 text-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>{t('rules.createRule')}</span>
          </Button>
        </div>
      </div>

      {/* Config seed failed/loading: explain why Create is disabled */}
      <SeedBlockedBanner />

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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <ActionBadge action={rl.action} />
                        {rl.continue && <ContinueBadge />}
                      </div>
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
          {rules.length > 6 && (
            <EntitySearchBar
              value={runtimeSearch}
              onChange={setRuntimeSearch}
              placeholder={t('rules.runtimeSearch')}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('rules.runtimeEditHint')}</p>
        <Card className="border-border bg-card overflow-hidden">
          {isLoading ? (
            <LoadingState />
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
          ) : visibleRuntimeRules.length === 0 ? (
            <div className="m-2 rounded-md border border-dashed py-10 text-center text-xs text-muted-foreground">
              {t('common.noResults', { query: runtimeSearch })}
            </div>
          ) : (
            <RuntimeRulesTable
              rules={visibleRuntimeRules}
              sortDesc={runtimeSortDesc}
              onToggleSort={() => setRuntimeSortDesc((d) => !d)}
              togglingNames={togglingNames}
              onToggle={handleToggle}
              onTest={openTest}
              onEdit={openRuntimeRuleInWizard}
            />
          )}
        </Card>
      </div>

      <RuleTestDialog rule={testRule} onClose={closeTest} key={testRule?.name ?? 'none'} />

      {/* Rule create/edit wizard — the SINGLE rule editor for both the
           config section and the runtime section. */}
      <RuleWizard open={wizardOpen} onOpenChange={setWizardOpen} existingRule={editingRule} />

      {/* Delete confirmation */}
      <DeleteEntityConfirm
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('rules.deleteTitle')}
        description={t('rules.deleteConfirm', { name: deleteTarget ?? '' })}
        onConfirm={confirmDeleteRule}
      />

      {/* Apply changes confirmation */}
      <ConfigApplyConfirmationDialog {...applyDialogProps} />
    </div>
  )
}
