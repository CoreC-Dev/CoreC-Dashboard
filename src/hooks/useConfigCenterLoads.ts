/**
 * Template & file loading for the Config Center — extracted from
 * useConfigCenter (custom-lint 500-line God-file limit).
 *
 * Owns the "replace both sides wholesale" entry points:
 * - template picker open state + loading a pre-built template,
 * -.yaml/.yml file upload into the editor and the configStore,
 * - the discard confirmation: a template/file load REPLACES all
 * pending edits, so when either side is dirty the operator must confirm
 * through the shared DiscardChangesDialog before anything is replaced.
 *
 * The caller (useConfigCenter) keeps owning the editor content and the
 * pending-edits predicate; the page consumes everything through
 * useConfigCenter's return value, so this split is invisible to the UI.
 */
import { type ChangeEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StatusMessage } from '@/hooks/useStatusMessage'
import type { ConfigTemplate } from '@/lib/configTemplates'
import { generateRandomSecret } from '@/lib/utils'

interface ConfigCenterLoadsOptions {
  /** Editor content setter (also clears the stale dry-run result). */
  applyYamlContent: (text: string) => void
  /** Parse YAML into the configStore form side. */
  loadFromYaml: (yaml: string) => string | null
  /** Transient status strip setter, shared with the caller. */
  setStatusMsg: (msg: StatusMessage) => void
  /** Whether the form side or the editor holds unapplied edits (discard gate). */
  hasPendingEdits: () => boolean
}

export function useConfigCenterLoads(options: ConfigCenterLoadsOptions) {
  const { applyYamlContent, loadFromYaml, setStatusMsg, hasPendingEdits } = options
  const { t } = useTranslation()
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  // Template/file loads waiting for the operator to confirm the discard.
  const [pendingTemplate, setPendingTemplate] = useState<ConfigTemplate | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  // Read a user-selected .yaml/.yml file into both the Monaco editor and
  // the configStore.
  const readFileIntoEditor = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result)
      applyYamlContent(text)
      const err = loadFromYaml(text)
      if (err) {
        setStatusMsg({
          type: 'error',
          text: t('config.importYamlFailed', { error: err }),
        })
      } else {
        setStatusMsg({
          type: 'success',
          text: t('config.fileLoaded', { name: file.name }),
        })
      }
    }
    reader.onerror = () => setStatusMsg({ type: 'error', text: t('config.fileLoadFailed') })
    reader.readAsText(file)
  }

  // "Upload YAML file" — An upload REPLACES both sides wholesale, so
  // when unapplied edits exist the operator must confirm the discard first
  // (DiscardChangesDialog, same gate as the banner's Discard button).
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected
    e.target.value = ''
    if (hasPendingEdits()) {
      setPendingFile(file)
      return
    }
    readFileIntoEditor(file)
  }

  // Load a pre-built configuration template into the working config.
  // Replaces the weak placeholder secret with a random one. The placeholder
  // is anchored with its surrounding YAML quotes so a comment mentioning it
  // can never swallow the replacement; every template ships api.secret as
  // secret: "REPLACE_ME_WITH_A_STRONG_SECRET".
  const applyTemplate = (template: ConfigTemplate) => {
    const yamlWithSecret = template.yaml.replace(
      '"REPLACE_ME_WITH_A_STRONG_SECRET"',
      `"${generateRandomSecret()}"`,
    )
    applyYamlContent(yamlWithSecret)
    const err = loadFromYaml(yamlWithSecret)
    if (err) {
      setStatusMsg({ type: 'error', text: t('config.importYamlFailed', { error: err }) })
    } else {
      setStatusMsg({
        type: 'success',
        text: t('config.templateLoaded', { name: template.name }),
      })
    }
    setTemplatePickerOpen(false)
  }

  // Same as file upload: a template replaces pending edits wholesale,
  // so confirm the discard first when anything is unapplied.
  const handleLoadTemplate = (template: ConfigTemplate) => {
    if (hasPendingEdits()) {
      setPendingTemplate(template)
      return
    }
    applyTemplate(template)
  }

  // Confirm/cancel the pending template/file load (DiscardChangesDialog).
  const confirmPendingLoad = () => {
    const file = pendingFile
    const template = pendingTemplate
    setPendingFile(null)
    setPendingTemplate(null)
    if (file) readFileIntoEditor(file)
    else if (template) applyTemplate(template)
  }

  const cancelPendingLoad = () => {
    setPendingFile(null)
    setPendingTemplate(null)
  }

  return {
    templatePickerOpen,
    setTemplatePickerOpen,
    handleFileUpload,
    handleLoadTemplate,
    loadConfirmOpen: pendingTemplate !== null || pendingFile !== null,
    confirmPendingLoad,
    cancelPendingLoad,
  }
}
