import { ArrowLeft, Download, Globe, Palette, Trash2, Upload } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { InstanceExportDialog } from '@/components/home/InstanceExportDialog'
import { InstanceImportDialog } from '@/components/home/InstanceImportDialog'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import i18n, { setLocale } from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'
import { THEME_I18N_KEYS, THEME_VARIANTS, type ThemeMode, useThemeStore } from '@/stores/themeStore'

export const GlobalSettingsPage: React.FC = () => {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const clearAll = useInstanceStore((s) => s.clearAll)
  const instanceCount = useInstanceStore((s) => s.instances.length)

  const [importOpen, setImportOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const handleExport = () => {
    setExportOpen(true)
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

      {/* Import dialog — The settings page used to offer only a bare
           textarea while the homepage had drag & drop + file browse for the
           exact same operation. One shared component now serves both. */}
      <InstanceImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Clear all dialog — The most destructive action in the app used
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
              variant="destructive"
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
