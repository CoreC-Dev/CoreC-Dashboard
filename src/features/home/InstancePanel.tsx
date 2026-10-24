import {
  Check,
  Download,
  HelpCircle,
  Moon,
  Palette,
  Plus,
  Settings,
  Sun,
  Upload,
} from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { InstanceExportDialog } from '@/components/home/InstanceExportDialog'
import { InstanceImportDialog } from '@/components/home/InstanceImportDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InstanceCard } from '@/features/home/InstanceCard'
import { InstanceDialog } from '@/features/home/InstanceDialog'
import { probeOneInstance, useHomepageProbe } from '@/features/home/useHomepageProbe'
import i18n, { setLocale } from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'
import { THEME_I18N_KEYS, THEME_VARIANTS, useThemeStore } from '@/stores/themeStore'
import type { CoreCInstance } from '@/types/models'

/**
 * The whole UI previously had zero outbound help links — an operator
 * stuck on "what do I put in this form?" had nowhere to click. Both the
 * header help button and the empty-state hint link point here.
 */
const HELP_URL = 'https://github.com/CoreC-Dev/CoreC-Dashboard'

export const InstancePanel: React.FC = () => {
  const { t } = useTranslation()
  const instances = useInstanceStore((s) => s.instances)
  const addInstance = useInstanceStore((s) => s.addInstance)
  const updateInstance = useInstanceStore((s) => s.updateInstance)
  const [searchParams, setSearchParams] = useSearchParams()
  // Surfaced as a banner when localStorage writes fail (quota /
  // private mode) so the data-loss risk is not discovered the hard way.
  const persistFailed = useInstanceStore((s) => s.persistFailed)

  // Probe all instances in parallel every 15s — simultaneous multi-instance monitoring
  useHomepageProbe()

  const { theme, resolvedTheme, setTheme } = useThemeStore()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingInstance, setEditingInstance] = React.useState<CoreCInstance | undefined>()
  const [importOpen, setImportOpen] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)

  const handleAdd = () => {
    setEditingInstance(undefined)
    setDialogOpen(true)
  }

  const handleEdit = React.useCallback((instance: CoreCInstance) => {
    setEditingInstance(instance)
    setDialogOpen(true)
  }, [])

  // ConnectionGate's failure screen links here with
  // ?edit=<instanceId> ("edit this instance"). Open the edit dialog for
  // that instance, then strip the param — leaving it would re-open the
  // dialog on every later visit to the homepage.
  React.useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    const target = instances.find((i) => i.id === editId)
    if (target) handleEdit(target)
    setSearchParams({}, { replace: true })
  }, [searchParams, instances, handleEdit, setSearchParams])

  const handleSubmit = (data: {
    name: string
    baseUrl: string
    secret: string
    useProxy?: 'auto' | 'proxy' | 'direct'
    color?: string
    notes?: string
    tags?: string[]
  }) => {
    let targetId: string
    if (editingInstance) {
      updateInstance(editingInstance.id, data)
      targetId = editingInstance.id
    } else {
      targetId = addInstance(data)
    }
    // Probe immediately — the card must not sit on a stale grey/red
    // state for up to 15s after the operator saved a new or fixed config.
    void probeOneInstance(targetId)
  }

  const handleExport = () => {
    setExportOpen(true)
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('zh') ? 'en' : 'zh-CN'
    setLocale(nextLang)
  }

  // The toggle used to display the CURRENT language ("中" while the
  // UI was already Chinese) with no title or aria-label — an operator could
  // not tell what a click would do. It now shows the language a click will
  // switch TO, and announces the same in its accessible name.
  const isZh = i18n.language.startsWith('zh')
  const languageToggleLabel = isZh ? 'EN' : '中'
  const languageToggleTitle = t('common.switchToLanguage', {
    language: isZh ? 'English' : '中文',
  })

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
          <img src="/logo-animated.svg" alt="CoreC" className="w-8 h-8 shrink-0" />
          <span className="font-extrabold text-lg tracking-tight">CoreC</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            Dashboard
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
            title={languageToggleTitle}
            aria-label={languageToggleTitle}
            className="h-8 px-2 text-xs font-mono text-muted-foreground hover:text-foreground"
          >
            {languageToggleLabel}
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
          {/* An outbound help entry — the audit found the entire UI had
               none, leaving first-time operators with a form and no docs. */}
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={t('instances.help')}
            title={t('instances.help')}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <a href={HELP_URL} target="_blank" rel="noopener noreferrer">
              <HelpCircle className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto p-4 md:p-8">
        {/* LocalStorage writes failed (quota/private mode) — without
             this warning the list silently evaporates on the next refresh. */}
        {persistFailed && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm text-status-warning"
          >
            {t('instances.storagePersistFailed')}
          </div>
        )}
        {instances.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <img src="/logo-animated.svg" alt="CoreC" className="w-32 h-32 mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('instances.emptyTitle')}</h2>
            <p className="text-sm text-muted-foreground mb-2 max-w-md">
              {t('instances.emptyDesc')}
            </p>
            {/* The first-run question ("what even is an API key?") gets
                 an actionable link instead of a dead end. */}
            <a
              href={HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline underline-offset-4 hover:text-primary/80 mb-6"
            >
              {t('instances.emptyHelpHint')}
            </a>
            <div className="flex items-center gap-3">
              <Button onClick={handleAdd} size="lg">
                <Plus className="w-4 h-4 mr-2" />
                {t('instances.addNew')}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)} size="lg">
                <Upload className="w-4 h-4 mr-2" />
                {t('instances.import')}
              </Button>
            </div>
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

      {/* Import dialog — One shared component (drag & drop + file
           browse + paste) for the homepage AND the settings page; the two
           entry points used to offer different UI for the same operation. */}
      <InstanceImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <InstanceExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  )
}
