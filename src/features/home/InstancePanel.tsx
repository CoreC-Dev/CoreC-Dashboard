import { Check, Download, Moon, Palette, Plus, Settings, Sun, Upload } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AnimatedLogo } from '@/components/layout/AnimatedLogo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import i18n, { setLocale } from '@/i18n'
import type { CoreCInstance } from '@/stores/instanceStore'
import { useInstanceStore } from '@/stores/instanceStore'
import { THEME_I18N_KEYS, THEME_VARIANTS, useThemeStore } from '@/stores/themeStore'
import { InstanceCard } from './InstanceCard'
import { InstanceDialog } from './InstanceDialog'
import { useHomepageProbe } from './useHomepageProbe'

export const InstancePanel: React.FC = () => {
  const { t } = useTranslation()
  const instances = useInstanceStore((s) => s.instances)
  const addInstance = useInstanceStore((s) => s.addInstance)
  const updateInstance = useInstanceStore((s) => s.updateInstance)
  const exportInstances = useInstanceStore((s) => s.exportInstances)
  const importInstances = useInstanceStore((s) => s.importInstances)

  // Probe all instances in parallel every 15s — simultaneous multi-instance monitoring
  useHomepageProbe()

  const { theme, resolvedTheme, setTheme } = useThemeStore()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingInstance, setEditingInstance] = React.useState<CoreCInstance | undefined>()
  const [importOpen, setImportOpen] = React.useState(false)
  const [importText, setImportText] = React.useState('')
  const [importResult, setImportResult] = React.useState<string | null>(null)

  const handleAdd = () => {
    setEditingInstance(undefined)
    setDialogOpen(true)
  }

  const handleEdit = React.useCallback((instance: CoreCInstance) => {
    setEditingInstance(instance)
    setDialogOpen(true)
  }, [])

  const handleSubmit = (data: {
    name: string
    baseUrl: string
    secret: string
    color?: string
    notes?: string
    tags?: string[]
  }) => {
    if (editingInstance) {
      updateInstance(editingInstance.id, data)
    } else {
      addInstance(data)
    }
  }

  const handleExport = () => {
    const json = exportInstances()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `corec-instances-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const result = importInstances(importText, 'merge')
    setImportResult(t('instances.importResult', { added: result.added, skipped: result.skipped }))
    if (result.added > 0) {
      setImportOpen(false)
      setImportText('')
      setImportResult(null)
    }
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('zh') ? 'en' : 'zh-CN'
    setLocale(nextLang)
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Subtle decorative gradient orb */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
        />
      </div>

      {/* Top bar — brand bar with logo */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-2.5">
          <AnimatedLogo className="w-8 h-8 shrink-0 text-primary" />
          <span className="font-extrabold text-lg tracking-tight">CoreC</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            {t('nav.dashboard')}
          </span>
        </div>
        <div className="flex items-center space-x-1 sm:space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('settings.theme', { defaultValue: 'Theme' })}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                {resolvedTheme === 'dark' ? (
                  <Moon className="w-4 h-4" />
                ) : (
                  <Sun className="w-4 h-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5" />
                {t('settings.theme', { defaultValue: 'Theme' })}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setTheme('system')}
                className="flex items-center justify-between"
              >
                <span>{t(THEME_I18N_KEYS.system)}</span>
                {theme === 'system' && <Check className="w-3.5 h-3.5" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {THEME_VARIANTS.map((variant) => (
                <DropdownMenuItem
                  key={variant}
                  onClick={() => setTheme(variant)}
                  className="flex items-center justify-between"
                >
                  <span>{t(THEME_I18N_KEYS[variant])}</span>
                  {theme === variant && <Check className="w-3.5 h-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLanguage}
            className="h-8 px-2 text-xs font-mono text-muted-foreground hover:text-foreground"
          >
            {i18n.language.startsWith('zh') ? '中' : 'EN'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={t('nav.settings')}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Link to="/settings">
              <Settings className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto p-4 md:p-8">
        {instances.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AnimatedLogo className="w-16 h-16 mb-4 text-primary" />
            <h2 className="text-xl font-semibold mb-2">{t('instances.emptyTitle')}</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {t('instances.emptyDesc')}
            </p>
            <Button onClick={handleAdd} size="lg">
              <Plus className="w-4 h-4 mr-2" />
              {t('instances.addNew')}
            </Button>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{t('instances.myInstances')}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('instances.instanceCount', { count: instances.length })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  <span className="hidden sm:inline">{t('instances.export')}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  <span className="hidden sm:inline">{t('instances.import')}</span>
                </Button>
                <Button onClick={handleAdd} size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {t('instances.addNew')}
                </Button>
              </div>
            </div>

            {/* Card grid — responsive: 1 col mobile, 2 col tablet, 3-4 col desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 card-stagger">
              {instances.map((instance) => (
                <div key={instance.id} className="card-enter">
                  <InstanceCard instance={instance} onEdit={handleEdit} />
                </div>
              ))}

              {/* Add new card */}
              <button
                type="button"
                onClick={handleAdd}
                className="rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/40 transition-all flex flex-col items-center justify-center min-h-[180px] gap-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center transition-colors group-hover:bg-primary/10">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">{t('instances.addNew')}</span>
              </button>
            </div>
          </>
        )}
      </main>

      {/* Add/Edit dialog */}
      <InstanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        instance={editingInstance}
        onSubmit={handleSubmit}
      />

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
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
          {importResult && <p className="text-sm text-muted-foreground">{importResult}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleImport} disabled={!importText.trim()}>
              {t('instances.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
