import { AlertTriangle } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { ConfigBackupsPanel } from '@/components/admin/ConfigBackupsPanel'
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
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { UnsavedChangesBanner } from '@/components/wizard/UnsavedChangesBanner'
import { ValidationBanner } from '@/components/wizard/ValidationBanner'
import { DerivedTagsEditor } from '@/features/admin/DerivedTagsEditor'
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
    getSavedYaml,
    mode,
    requestModeSwitch,
    bridgeTarget,
    bridgeImport,
    bridgeOverwrite,
    bridgeCancel,
    applyGuardOpen,
    applyGuardProceed,
    applyGuardCancel,
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
    yamlApplyOpen,
    setYamlApplyOpen,
    yamlApplyError,
    handleYamlApplyConfirm,
  } = useConfigCenter()

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('config.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('config.subtitle')}</p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap">
          {/* Mode Switcher — routed through requestModeSwitch so a divergent
              form/YAML state triggers the keep-one-side bridge (C-D1). */}
          <ModeSwitcher mode={mode} onSetMode={requestModeSwitch} />

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

          {/* Derived tags editor */}
          <DerivedTagsEditor />

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

      {/* Server-side backups — restore timeline persisted by CoreC itself.
          Sits next to the local ChangeHistoryCard: both are rollback
          surfaces, but these survive browser resets and are taken by the
          server on every reload, not only on Dashboard submissions. */}
      <ConfigBackupsPanel />

      {/* Change History — persisted snapshots of every PUT /configs submission */}
      <ChangeHistoryCard history={history} onRestore={handleRestore} />

      {/* YAML-mode apply confirmation — safety gate before PUT /configs
          from the Monaco editor's "Hot Reload" button. Shows a diff
          against the last saved YAML and requires explicit confirmation. */}
      <ConfigApplyConfirmationDialog
        open={yamlApplyOpen}
        onOpenChange={(v) => !updateMutation.isPending && setYamlApplyOpen(v)}
        beforeYaml={getSavedYaml()}
        afterYaml={yamlContent}
        applying={updateMutation.isPending}
        onConfirm={handleYamlApplyConfirm}
        applyError={yamlApplyError ?? undefined}
      />

      {/* C-D1 ① — hot-reload acknowledgement when the editor content does
          not include the form side's unapplied edits. */}
      <AlertDialog open={applyGuardOpen} onOpenChange={(v) => !v && applyGuardCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-status-warning" />
              {t('configCenter.applyGuardTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('configCenter.applyGuardDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-8 text-xs" onClick={applyGuardCancel}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction className="h-8 text-xs" onClick={applyGuardProceed}>
              {t('configCenter.applyGuardProceed')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* C-D1 ② — mode-switch bridge: the form side and the YAML editor
          diverged; the operator picks which side to keep before switching. */}
      <AlertDialog open={bridgeTarget !== null} onOpenChange={(v) => !v && bridgeCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('configCenter.bridgeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('configCenter.bridgeDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:flex-col sm:items-stretch">
            <AlertDialogAction className="h-8 text-xs" onClick={bridgeImport}>
              {t('configCenter.bridgeImport')}
            </AlertDialogAction>
            <AlertDialogAction className="h-8 text-xs" onClick={bridgeOverwrite}>
              {t('configCenter.bridgeOverwrite')}
            </AlertDialogAction>
            <AlertDialogCancel className="h-8 text-xs" onClick={bridgeCancel}>
              {t('common.cancel')}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
