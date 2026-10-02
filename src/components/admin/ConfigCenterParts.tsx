/**
 * Shared toolbar + status sub-components for the Config Center page.
 *
 * Extracted from ConfigCenterPage.tsx (TD-CPLX-001) as pure/presentational
 * pieces — each receives its data and callbacks via props and owns no business
 * state. No behavior changes: identical CSS classes, i18n keys, and structure.
 * None of these import from `@/features/*` (layer rule: components ← features
 * is forbidden), so the feature-owned structured editors stay composed in the
 * page itself. Form-mode cards live in ConfigCenterForm.tsx and YAML-mode
 * cards in ConfigCenterYaml.tsx.
 */
import {
  AlertCircle,
  CheckCircle2,
  CloudDownload,
  Code2,
  Download,
  Flame,
  FlaskConical,
  LayoutTemplate,
  Sliders,
  Upload,
} from 'lucide-react'
import type React from 'react'
import { type ChangeEvent, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ConfigMode } from '@/hooks/useConfigCenter'
import type { StatusMessage } from '@/hooks/useStatusMessage'
import { CONFIG_TEMPLATES, type ConfigTemplate } from '@/lib/configTemplates'

interface ComponentEntry {
  name: string
  type: string
  action?: string
  priority?: number
}

/** Drivers / Transports / Rules summary list with a header count and empty
 *  state. Shared by the active-config overview card. */
export const ComponentList: React.FC<{
  title: string
  icon: React.ReactNode
  entries: ComponentEntry[]
  typeLabel: string
  emptyText: string
}> = ({ title, icon, entries, typeLabel, emptyText }) => (
  <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
    <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center space-x-1.5">
      {icon}
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} · {entries.length}
      </span>
    </div>
    <div className="max-h-56 overflow-y-auto divide-y divide-border/40">
      {entries.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground">{emptyText}</div>
      ) : (
        entries.map((e) => (
          <div
            key={`${title}-${e.name}`}
            className="px-3 py-2 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">{e.name}</div>
              <div className="text-xs font-mono text-muted-foreground truncate">
                {typeLabel}: {e.type}
              </div>
            </div>
            <div className="flex items-center space-x-1.5 shrink-0">
              {e.action && (
                <Badge variant="outline" className="text-xs">
                  {e.action}
                </Badge>
              )}
              {typeof e.priority === 'number' && (
                <span className="text-xs font-mono text-muted-foreground">#{e.priority}</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)

/** Transient success/error notice. Renders nothing when there is no message. */
export const StatusMessageView: React.FC<{ statusMsg: StatusMessage }> = ({ statusMsg }) => {
  if (!statusMsg) return null
  return (
    <div
      className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
        statusMsg.type === 'success'
          ? 'bg-status-running/10 border-status-running/20 text-status-running'
          : 'bg-status-error/10 border-status-error/20 text-status-error'
      }`}
    >
      {statusMsg.type === 'success' ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 shrink-0" />
      )}
      <span>{statusMsg.text}</span>
    </div>
  )
}

/** Form ↔ YAML mode toggle. */
export const ModeSwitcher: React.FC<{
  mode: ConfigMode
  onSetMode: (mode: ConfigMode) => void
}> = ({ mode, onSetMode }) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center bg-muted p-0.5 rounded-lg border border-border text-xs">
      <button
        type="button"
        onClick={() => onSetMode('form')}
        aria-pressed={mode === 'form'}
        className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors ${
          mode === 'form'
            ? 'bg-background text-foreground font-semibold shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Sliders className="w-3.5 h-3.5" />
        <span>{t('config.formView')}</span>
      </button>
      <button
        type="button"
        onClick={() => onSetMode('yaml')}
        aria-pressed={mode === 'yaml'}
        className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors ${
          mode === 'yaml'
            ? 'bg-background text-foreground font-semibold shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Code2 className="w-3.5 h-3.5" />
        <span>{t('config.yamlCode')}</span>
      </button>
    </div>
  )
}

/** YAML → Form import and Form → YAML sync bridge buttons. */
export const YamlFormBridgeButtons: React.FC<{
  mode: ConfigMode
  onImport: () => void
  onSync: () => void
  configWorkingExists: boolean
}> = ({ mode, onImport, onSync, configWorkingExists }) => {
  const { t } = useTranslation()
  return (
    <>
      {mode === 'yaml' && (
        <Button
          variant="outline"
          size="sm"
          onClick={onImport}
          className="h-8 text-xs"
          title={t('config.importYamlHint')}
        >
          <Sliders className="w-3.5 h-3.5 mr-1" />
          <span>{t('config.importYamlToForm')}</span>
        </Button>
      )}
      {mode === 'form' && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={!configWorkingExists}
          className="h-8 text-xs"
          title={t('config.syncFormHint')}
        >
          <Code2 className="w-3.5 h-3.5 mr-1" />
          <span>{t('config.syncFormToYaml')}</span>
        </Button>
      )}
    </>
  )
}

/** Hidden file input + upload/download icon buttons. Owns the input ref. */
export const FileTransferButtons: React.FC<{
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void
  onDownload: () => void
}> = ({ onUpload, onDownload }) => {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml,.txt"
        onChange={onUpload}
        className="hidden"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        className="h-8 text-xs"
        title={t('config.uploadFileHint')}
        aria-label={t('config.uploadFileHint')}
      >
        <Upload className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDownload}
        className="h-8 text-xs"
        title={t('config.downloadFileHint')}
        aria-label={t('config.downloadFileHint')}
      >
        <Download className="w-3.5 h-3.5" />
      </Button>
    </>
  )
}

/** Pre-built configuration template picker dropdown. */
export const TemplatePicker: React.FC<{
  open: boolean
  onToggle: () => void
  onClose: () => void
  onLoadTemplate: (template: ConfigTemplate) => void
}> = ({ open, onToggle, onClose, onLoadTemplate }) => {
  const { t } = useTranslation()
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="h-8 text-xs"
        title={t('config.templatesHint')}
        aria-label={t('config.templatesHint')}
      >
        <LayoutTemplate className="w-3.5 h-3.5" />
      </Button>
      {open && (
        <>
          {/* Click-away overlay */}
          {/* biome-ignore lint/a11y/useSemanticElements: invisible click-away backdrop, not an interactive control */}
          <div
            className="fixed inset-0 z-40"
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close template picker"
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
            <div className="p-2 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
                {t('config.templates')}
              </p>
              {CONFIG_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onLoadTemplate(tpl)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{tpl.name}</span>
                    <Badge variant="outline" className="text-xs px-1 py-0 shrink-0">
                      {tpl.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Load-from-server, dry-run validate, and hot-reload action buttons. */
export const ServerActionButtons: React.FC<{
  mode: ConfigMode
  isFetchingRaw: boolean
  onLoadFromServer: () => void
  isValidatePending: boolean
  onDryRunValidate: () => void
  isUpdatePending: boolean
  onHotReload: () => void
}> = ({
  mode,
  isFetchingRaw,
  onLoadFromServer,
  isValidatePending,
  onDryRunValidate,
  isUpdatePending,
  onHotReload,
}) => {
  const { t } = useTranslation()
  return (
    <>
      {/* Path A — Load from Server: fetch the live redacted config (secrets
          masked as ***) into the editor. Available in both modes so the
          operator can backfill the server's real config before editing. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onLoadFromServer}
        disabled={isFetchingRaw}
        className="h-8 text-xs"
        title={t('config.loadFromServerHint')}
        aria-label={t('config.loadFromServerHint')}
      >
        <CloudDownload className="w-3.5 h-3.5" />
      </Button>
      {/* Path A — Dry-run Validate (YAML mode only, since the payload is
          the editor's YAML text). Validates on the server WITHOUT applying. */}
      {mode === 'yaml' && (
        <Button
          variant="outline"
          size="sm"
          onClick={onDryRunValidate}
          disabled={isValidatePending}
          className="h-8 text-xs"
          title={t('config.dryRunValidateHint')}
        >
          <FlaskConical className="w-3.5 h-3.5 mr-1" />
          <span>
            {isValidatePending ? t('config.dryRunValidating') : t('config.dryRunValidate')}
          </span>
        </Button>
      )}
      {mode === 'yaml' && (
        <Button
          size="sm"
          onClick={onHotReload}
          disabled={isUpdatePending}
          className="h-8 text-xs glow-primary"
        >
          <Flame className="w-3.5 h-3.5 mr-1 text-status-warning" />
          <span>{isUpdatePending ? t('config.reloading') : t('config.hotReload')}</span>
        </Button>
      )}
    </>
  )
}
