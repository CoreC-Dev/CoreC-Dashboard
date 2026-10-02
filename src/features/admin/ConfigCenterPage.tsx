import type React from 'react'
import { useTranslation } from 'react-i18next'
import { ActiveSummaryCard, RuntimeParamsCard } from '@/components/admin/ConfigCenterForm'
import {
  FileTransferButtons,
  ModeSwitcher,
  ServerActionButtons,
  StatusMessageView,
  TemplatePicker,
  YamlFormBridgeButtons,
} from '@/components/admin/ConfigCenterParts'
import { ChangeHistoryCard, DiffPreview, YamlEditorCard } from '@/components/admin/ConfigCenterYaml'
import { EventLogTerminal } from '@/components/admin/EventLogTerminal'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { UnsavedChangesBanner } from '@/components/wizard/UnsavedChangesBanner'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { GlobalConfigEditor } from '@/features/admin/GlobalConfigEditor'
import { NodeConfigEditor } from '@/features/admin/NodeConfigEditor'
import { RuleGroupEditor } from '@/features/admin/RuleGroupEditor'
import { RuleProviderEditor } from '@/features/admin/RuleProviderEditor'
import { useConfigCenter } from '@/hooks/useConfigCenter'

/**
 * Config Center — the operator's single screen for editing the CoreC gateway
 * configuration. Two editing modes share one working config:
 *  - Form view: structured editors (Global/Node/RuleProvider/RuleGroup) backed
 *    by the configStore, plus a runtime log-level patcher and live overview.
 *  - YAML view: a Monaco editor over the raw config with dry-run validation,
 *    hot reload, and a diff preview against the last submission.
 *
 * This file is a thin composition root: all stateful logic lives in
 * `useConfigCenter` and the presentational pieces in `ConfigCenterParts`
 * (TD-CPLX-001 refactor — no behavior changes).
 */
export const ConfigCenterPage: React.FC = () => {
  const { t } = useTranslation()
  const {
    configData,
    isLoadingConfigs,
    isError,
    error,
    isFetchingConfigs,
    refetch,
    rawConfigQuery,
    validateMutation,
    updateMutation,
    patchMutation,
    configDirty,
    configWorkingExists,
    hasValidationErrors,
    applyDialogProps,
    openApplyDialog,
    revertWorkingConfig,
    mode,
    setMode,
    yamlContent,
    setYamlContent,
    currentLogLevel,
    statusMsg,
    lastSubmittedYaml,
    diffOpen,
    setDiffOpen,
    templatePickerOpen,
    setTemplatePickerOpen,
    history,
    diffLines,
    hasDiffChanges,
    handleImportYamlToForm,
    handleSyncFormToYaml,
    handleFileUpload,
    handleFileDownload,
    handleLoadTemplate,
    handleLogLevelChange,
    handleHotReload,
    handleLoadFromServer,
    handleDryRunValidate,
    handleRestore,
  } = useConfigCenter()

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('config.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('config.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap">
          {/* Mode Switcher */}
          <ModeSwitcher mode={mode} onSetMode={setMode} />

          {/* YAML ↔ Form bridge buttons */}
          <YamlFormBridgeButtons
            mode={mode}
            onImport={handleImportYamlToForm}
            onSync={handleSyncFormToYaml}
            configWorkingExists={configWorkingExists}
          />

          {/* File upload / download — available in both modes */}
          <FileTransferButtons onUpload={handleFileUpload} onDownload={handleFileDownload} />

          {/* Config templates — pre-built presets */}
          <TemplatePicker
            open={templatePickerOpen}
            onToggle={() => setTemplatePickerOpen((v) => !v)}
            onClose={() => setTemplatePickerOpen(false)}
            onLoadTemplate={handleLoadTemplate}
          />

          <ServerActionButtons
            mode={mode}
            isFetchingRaw={rawConfigQuery.isFetching}
            onLoadFromServer={handleLoadFromServer}
            isValidatePending={validateMutation.isPending}
            onDryRunValidate={handleDryRunValidate}
            isUpdatePending={updateMutation.isPending}
            onHotReload={handleHotReload}
          />
        </div>
      </div>

      <StatusMessageView statusMsg={statusMsg} />

      {mode === 'form' ? (
        <div className="space-y-4">
          {/* Runtime Parameter Patch Card */}
          <RuntimeParamsCard
            currentLogLevel={currentLogLevel}
            onLogLevelChange={handleLogLevelChange}
            isPatchPending={patchMutation.isPending}
          />

          {/* Real-time CoreC event log stream — placed directly below the
              runtime log-level patch card so the operator sees the effect of
              switching levels (e.g. debug) flow into the terminal instantly. */}
          <EventLogTerminal height="h-64" />

          {/* Current Configuration (synced from GET /configs overview) */}
          <ActiveSummaryCard
            configData={configData}
            isLoadingConfigs={isLoadingConfigs}
            isError={isError}
            error={error}
            isFetchingConfigs={isFetchingConfigs}
            onRetry={() => refetch()}
          />

          {/* Dirty banner for configStore-managed edits */}
          <UnsavedChangesBanner
            dirty={configDirty}
            unsavedChangesLabel={t('config.unsavedChanges')}
            applyChangesLabel={t('config.applyChanges')}
            hasValidationErrors={hasValidationErrors}
            onApply={() => openApplyDialog()}
            onDiscard={revertWorkingConfig}
          />

          {/* Live validation errors banner */}
          <ValidationBanner />

          {/* Structured global config editor */}
          <GlobalConfigEditor />

          {/* Structured node config editor */}
          <NodeConfigEditor />

          {/* Rule providers editor */}
          <RuleProviderEditor />

          {/* Rule groups editor */}
          <RuleGroupEditor />

          {/* Apply confirmation for configStore edits */}
          <ConfigApplyConfirmationDialog {...applyDialogProps} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Changes Preview — diff against the last submitted YAML */}
          <DiffPreview
            lastSubmittedYaml={lastSubmittedYaml}
            diffOpen={diffOpen}
            onToggleDiff={() => setDiffOpen((open) => !open)}
            diffLines={diffLines}
            hasDiffChanges={hasDiffChanges}
          />

          {/* YAML Monaco Editor */}
          <YamlEditorCard yamlContent={yamlContent} onYamlChange={setYamlContent} />
        </div>
      )}

      {/* Change History — persisted snapshots of every PUT /configs submission */}
      <ChangeHistoryCard history={history} onRestore={handleRestore} />
    </div>
  )
}
