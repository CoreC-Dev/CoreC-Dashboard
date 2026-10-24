import { AlertTriangle, CheckCircle2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { ConfigApplyConfirmationDialog } from '@/components/wizard/ConfigApplyConfirmationDialog'
import { DiscardChangesDialog } from '@/components/wizard/DiscardChangesDialog'
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
 * - Form view: structured editors (Global/Node/RuleProvider/RuleGroup) backed
 * by the configStore, plus a runtime log-level patcher and live overview.
 * - YAML view: a Monaco editor over the raw config with dry-run validation,
 * hot reload, and a diff preview against the last submission.
 *
 * This file is a thin composition root: all stateful logic lives in
 * `useConfigCenter` and the presentational pieces in `ConfigCenterParts`
 * (001 refactor — no behavior changes).
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
    patchMutation,
    configDirty,
    configWorkingExists,
    hasValidationErrors,
    applyDialogProps,
    openApplyDialog,
    revertWorkingConfig,
    getSavedYaml,
    seedLoadFailed,
    retrySeed,
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
    diffBaselineYaml,
    diffOpen,
    setDiffOpen,
    templatePickerOpen,
    setTemplatePickerOpen,
    history,
    diffLines,
    hasDiffChanges,
    dryRunResult,
    loadConfirmOpen,
    confirmPendingLoad,
    cancelPendingLoad,
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
    yamlApplying,
    yamlApplyOpen,
    setYamlApplyOpen,
    yamlApplyError,
    yamlApplyWarnings,
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
               form/YAML state triggers the keep-one-side bridge. */}
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
            isUpdatePending={yamlApplying}
            onHotReload={handleHotReload}
          />
        </div>
      </div>

      <StatusMessageView statusMsg={statusMsg} />

      {/* The server config failed to load: creating or applying now
           could wipe a running config we have never seen. The store blocks
           the destructive paths; this banner tells the operator why and
           offers a retry. */}
      {seedLoadFailed && (
        <div
          role="alert"
          className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t('configCenter.seedLoadFailed')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={retrySeed}
            disabled={rawConfigQuery.isFetching}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Persistent dry-run validation result. Only a clean success
           goes through the auto-dismissing status strip; warnings and server
           rejections must stay readable here. */}
      {dryRunResult && (
        <div className="space-y-2">
          {dryRunResult.outcome === 'valid-with-warnings' && (
            <>
              <div className="rounded-md border border-status-running/20 bg-status-running/10 p-3 text-xs text-status-running flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {t('config.dryRunValid')}
              </div>
              <div className="rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning dark:text-status-warning space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {t('config.validationWarningsTitle', { count: dryRunResult.warnings.length })}
                </div>
                <ul className="space-y-0.5 ml-5 list-disc">
                  {dryRunResult.warnings.map((warn, i) => (
                    <li key={i} className="font-mono">
                      {warn}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          {dryRunResult.outcome === 'invalid' && (
            <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error dark:text-status-error flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('config.dryRunInvalid', { error: dryRunResult.error })}
            </div>
          )}
          {dryRunResult.outcome === 'request-failed' && (
            <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error dark:text-status-error flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('config.dryRunFailed', { error: dryRunResult.error })}
            </div>
          )}
        </div>
      )}

      {/* Dirty + validation banners — hoisted out of the mode branches
           so pending FORM edits stay visible while the operator
           works in YAML view. */}
      <UnsavedChangesBanner
        dirty={configDirty}
        unsavedChangesLabel={
          mode === 'yaml'
            ? `${t('config.unsavedChanges')} ${t('configCenter.editedInFormView')}`
            : t('config.unsavedChanges')
        }
        applyChangesLabel={t('config.applyChanges')}
        hasValidationErrors={hasValidationErrors}
        onApply={() => openApplyDialog()}
        onDiscard={revertWorkingConfig}
      />
      <ValidationBanner />

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
          {/* Changes Preview — diff against the saved server config */}
          <DiffPreview
            lastSubmittedYaml={diffBaselineYaml}
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
        onOpenChange={(v) => !yamlApplying && setYamlApplyOpen(v)}
        beforeYaml={getSavedYaml()}
        afterYaml={yamlContent}
        applying={yamlApplying}
        onConfirm={handleYamlApplyConfirm}
        validationWarnings={yamlApplyWarnings}
        applyError={yamlApplyError ?? undefined}
      />

      {/* Loading a template or file replaces both sides wholesale;
           when unapplied edits exist the operator confirms the discard first
           (same DiscardChangesDialog as the banner's Discard button). */}
      <DiscardChangesDialog
        open={loadConfirmOpen}
        onOpenChange={(v) => !v && cancelPendingLoad()}
        onConfirm={confirmPendingLoad}
      />

      {/* Hot-reload acknowledgement when the editor content does
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

      {/* Mode-switch bridge: the form side and the YAML editor
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
