import { ArrowLeft, Download, Globe, Palette, Trash2, Upload } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { InstanceExportDialog } from '@/components/home/InstanceExportDialog'
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
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import i18n, { setLocale } from '@/i18n'
import { cn } from '@/lib/cn'
import { useInstanceStore } from '@/stores/instanceStore'
import { THEME_I18N_KEYS, THEME_VARIANTS, type ThemeMode, useThemeStore } from '@/stores/themeStore'

/**
 * D-08: import outcome classification for the new ImportResult shape
 * ({added, skipped, invalid, parseError}). The old UI collapsed everything
 * into "added N, skipped N duplicates" — broken JSON and invalid entries
 * were indistinguishable from duplicates, and a clean import closed the
 * dialog with no confirmation at all.
 */
type ImportFeedback = {
  /** success: entries were added; partial: some/all entries skipped or invalid; error: nothing imported */
  tone: 'success' | 'partial' | 'error'
  message: string
}

const FEEDBACK_TONE_CLASS: Record<ImportFeedback['tone'], string> = {
  success: 'text-status-running',
  partial: 'text-status-warning',
  error: 'text-status-error',
}

/** How long a clean success stays visible before the dialog closes (D-08). */
const IMPORT_SUCCESS_CLOSE_MS = 1500

export const GlobalSettingsPage: React.FC = () => {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const importInstances = useInstanceStore((s) => s.importInstances)
  const clearAll = useInstanceStore((s) => s.clearAll)
  const instanceCount = useInstanceStore((s) => s.instances.length)

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const successCloseTimer = useRef<number | null>(null)

  // Never leak the pending success-close timer past unmount.
  useEffect(
    () => () => {
      if (successCloseTimer.current !== null) window.clearTimeout(successCloseTimer.current)
    },
    [],
  )

  const clearImportTimer = () => {
    if (successCloseTimer.current !== null) {
      window.clearTimeout(successCloseTimer.current)
      successCloseTimer.current = null
    }
  }

  const closeImport = () => {
    clearImportTimer()
    setImportOpen(false)
    setImportText('')
    setImportFeedback(null)
  }

  const handleExport = () => {
    setExportOpen(true)
  }

  const handleImport = () => {
    clearImportTimer()
    const result = importInstances(importText, 'merge')
    if (result.parseError) {
      // The payload itself was unusable (not JSON / not an array / forbidden
      // keys) — previously this was reported as "added 0, skipped 0".
      setImportFeedback({ tone: 'error', message: t('instances.importInvalid') })
      return
    }
    if (result.added > 0 && result.skipped === 0 && result.invalid === 0) {
      // Clean import: show a brief confirmation instead of closing silently,
      // then close the dialog.
      setImportFeedback({
        tone: 'success',
        message: t('instances.importSuccess', { added: result.added }),
      })
      successCloseTimer.current = window.setTimeout(() => closeImport(), IMPORT_SUCCESS_CLOSE_MS)
      return
    }
    if (result.added > 0 || (result.skipped > 0 && result.invalid > 0)) {
      setImportFeedback({
        tone: 'partial',
        message: t('instances.importPartial', {
          added: result.added,
          skipped: result.skipped,
          invalid: result.invalid,
        }),
      })
      return
    }
    if (result.skipped > 0) {
      setImportFeedback({
        tone: 'partial',
        message: t('instances.importAllSkipped', { skipped: result.skipped }),
      })
      return
    }
    if (result.invalid > 0) {
      // Valid JSON array, but every entry failed per-entry validation.
      setImportFeedback({ tone: 'error', message: t('instances.importInvalid') })
      return
    }
    // Valid JSON, empty array — nothing happened, nothing to complain about.
    setImportFeedback({
      tone: 'partial',
      message: t('instances.importResult', { added: 0, skipped: 0 }),
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={t('instances.backHome')}
            className="h-8 w-8"
          >
            <Link to="/">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <span className="font-semibold">{t('settings.title')}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">
        {/* Appearance */}
        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">{t('settings.preferences')}</h2>
          </div>

          {/* Theme */}
          <div className="space-y-2">
            <Label>{t('settings.themeMode')}</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as ThemeMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t(THEME_I18N_KEYS.system)}</SelectItem>
                {THEME_VARIANTS.map((variant) => (
                  <SelectItem key={variant} value={variant}>
                    {t(THEME_I18N_KEYS[variant])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('settings.themeModeDesc')}</p>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label>{t('settings.interfaceLanguage')}</Label>
            <Select
              value={i18n.language.startsWith('zh') ? 'zh-CN' : 'en'}
              onValueChange={(v) => setLocale(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN">{t('settings.zhCN')}</SelectItem>
                <SelectItem value="en">{t('settings.english')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('settings.interfaceLanguageDesc')}</p>
          </div>
        </section>

        {/* Data Management */}
        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">{t('instances.dataManagement')}</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('instances.instanceCount', { count: instanceCount })}
          </p>

          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              {t('instances.exportAll')}
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              {t('instances.import')}
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start text-status-error hover:text-status-error hover:bg-status-error/10"
              onClick={() => setClearOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('instances.clearAll')}
            </Button>
          </div>
        </section>
      </main>

      {/* Import dialog */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!open) closeImport()
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('instances.importTitle')}</DialogTitle>
            <DialogDescription>{t('instances.importDesc')}</DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full h-48 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={t('instances.importTitle')}
            placeholder='[{"id":"inst_...","name":"...","baseUrl":"...","secret":"..."}]'
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {importFeedback && (
            <p role="status" className={cn('text-sm', FEEDBACK_TONE_CLASS[importFeedback.tone])}>
              {importFeedback.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeImport}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleImport} disabled={!importText.trim()}>
              {t('instances.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear all dialog — D-07: the most destructive action in the app used
          a plain Dialog (a stray outside click dismisses/defuses it) and its
          confirm button repeated the trigger's exact wording. Aligned with
          the admin domain's AlertDialog discipline: cannot be dismissed by
          accident, and the confirm key states the consequence. */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('instances.clearAllTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('instances.clearAllDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                clearAll()
                setClearOpen(false)
              }}
            >
              {t('instances.clearAllConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <InstanceExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  )
}
