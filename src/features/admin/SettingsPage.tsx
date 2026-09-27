import {
  Download,
  Globe,
  HardDrive,
  Moon,
  RotateCcw,
  Save,
  Server,
  Sun,
  Upload,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { setLocale } from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'
import { useDashboardStore } from '@/stores/dashboardStore'
import { type ThemeMode, useThemeStore } from '@/stores/themeStore'
import type { DashboardLayout } from '@/types/dashboard'

export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { baseUrl, secret, setConnection } = useConnectionStore(
    useShallow((s) => ({ baseUrl: s.baseUrl, secret: s.secret, setConnection: s.setConnection })),
  )
  const { theme, setTheme } = useThemeStore(
    useShallow((s) => ({ theme: s.theme, setTheme: s.setTheme })),
  )
  const { currentLayout, resetToDefault } = useDashboardStore(
    useShallow((s) => ({ currentLayout: s.currentLayout, resetToDefault: s.resetToDefault })),
  )

  const [url, setUrl] = useState(baseUrl)
  const [token, setToken] = useState(secret)
  const [savedNotice, setSavedNotice] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [layoutNotice, setLayoutNotice] = useState<'success' | 'failed' | null>(null)
  const layoutNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutFileInputRef = useRef<HTMLInputElement>(null)

  // Clear any pending auto-hide timers when the page unmounts so we never
  // call setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      if (layoutNoticeTimerRef.current) clearTimeout(layoutNoticeTimerRef.current)
    }
  }, [])

  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault()
    setConnection(url, token)
    setSavedNotice(true)
    // Probe the new endpoint so isConnected reflects the freshly saved creds.
    // revalidate() handles its own errors internally, so fire-and-forget.
    void useConnectionStore.getState().revalidate()
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSavedNotice(false), 2000)
  }

  const exportLayoutJson = () => {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(currentLayout, null, 2))}`
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', 'corec-dashboard-layout.json')
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const showLayoutNotice = (kind: 'success' | 'failed') => {
    setLayoutNotice(kind)
    if (layoutNoticeTimerRef.current) clearTimeout(layoutNoticeTimerRef.current)
    layoutNoticeTimerRef.current = setTimeout(() => setLayoutNotice(null), 2500)
  }

  const handleLayoutImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      try {
        const parsed = JSON.parse(typeof text === 'string' ? text : '')
        if (!parsed || !Array.isArray(parsed.cards)) {
          showLayoutNotice('failed')
          return
        }
        const now = Date.now()
        const newLayout: DashboardLayout = {
          id: typeof parsed.id === 'string' ? parsed.id : `imported-${now}`,
          name: typeof parsed.name === 'string' ? parsed.name : 'Imported Layout',
          description: typeof parsed.description === 'string' ? parsed.description : undefined,
          cards: parsed.cards,
          createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : now,
          updatedAt: now,
        }
        // Mirror dashboardStore's localStorage persistence so imported
        // layouts survive reload (the store exposes no setLayout action).
        localStorage.setItem('corec_dashboard_layout', JSON.stringify(newLayout))
        useDashboardStore.setState({ currentLayout: newLayout })
        showLayoutNotice('success')
      } catch {
        showLayoutNotice('failed')
      }
    }
    reader.onerror = () => showLayoutNotice('failed')
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t('nav.settings')}</h1>
        <p className="text-xs text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {/* CoreC Endpoint Settings */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <Server className="w-4 h-4 text-primary" />
            <span>{t('settings.connection')}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {t('settings.endpointConnectionDesc', {
              defaultValue: 'Target REST and WebSocket host URL and Bearer security token',
            })}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSaveConnection}>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {t('connection.serverUrl')}
                </label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="font-mono text-xs h-9"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {t('connection.secretToken')}
                </label>
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono text-xs h-9"
                  required
                />
              </div>
            </div>

            <Button type="submit" size="sm" className="h-8 text-xs glow-primary">
              <Save className="w-3.5 h-3.5 mr-1" />
              <span>
                {savedNotice
                  ? t('settings.saved', { defaultValue: 'Saved!' })
                  : t('settings.updateCredentials', { defaultValue: 'Update Credentials' })}
              </span>
            </Button>
          </CardContent>
        </form>
      </Card>

      {/* Visual & Locale Preferences */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <Globe className="w-4 h-4 text-primary" />
            <span>{t('settings.theme')}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {t('settings.preferencesDesc', {
              defaultValue: 'System defaults and personal display customisation',
            })}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
            <div>
              <div className="text-xs font-semibold text-foreground">
                {t('settings.themeMode', { defaultValue: 'Theme Mode' })}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t('settings.themeModeDesc', {
                  defaultValue: 'Follow OS prefers-color-scheme or lock to dark/light',
                })}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {(['system', 'dark', 'light'] as ThemeMode[]).map((m) => (
                <Button
                  key={m}
                  variant={theme === m ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme(m)}
                  className="h-7 px-3 text-xs capitalize"
                >
                  {m === 'dark' ? (
                    <Moon className="w-3 h-3 mr-1" />
                  ) : m === 'light' ? (
                    <Sun className="w-3 h-3 mr-1" />
                  ) : null}
                  <span>{m}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
            <div>
              <div className="text-xs font-semibold text-foreground">
                {t('settings.interfaceLanguage', { defaultValue: 'Interface Language (i18n)' })}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t('settings.interfaceLanguageDesc', {
                  defaultValue: 'Chinese (zh-CN) / English (en)',
                })}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant={i18n.language.startsWith('zh') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLocale('zh-CN')}
                className="h-7 px-3 text-xs"
              >
                简体中文
              </Button>
              <Button
                variant={i18n.language.startsWith('en') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLocale('en')}
                className="h-7 px-3 text-xs"
              >
                English
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Layout Backup & Restore */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-primary" />
            <span>{t('settings.layoutBackup', { defaultValue: 'Dashboard Layout Backup' })}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {t('settings.layoutBackupDesc', {
              defaultValue: 'Export or reset your custom large-screen grid layout',
            })}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={exportLayoutJson} className="h-8 text-xs">
              <Download className="w-3.5 h-3.5 mr-1" />
              <span>{t('settings.exportLayout', { defaultValue: 'Export Layout' })}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => layoutFileInputRef.current?.click()}
              className="h-8 text-xs"
            >
              <Upload className="w-3.5 h-3.5 mr-1" />
              <span>{t('settings.importLayout', { defaultValue: 'Import Layout' })}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefault}
              className="h-8 text-xs text-rose-400 hover:text-rose-500 hover:bg-rose-500/10"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              <span>
                {t('settings.resetFactory', { defaultValue: 'Reset to Factory Default' })}
              </span>
            </Button>

            <input
              ref={layoutFileInputRef}
              type="file"
              accept=".json"
              onChange={handleLayoutImport}
              className="hidden"
            />
          </div>

          {layoutNotice && (
            <div
              className={`text-xs font-medium ${
                layoutNotice === 'failed' ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {layoutNotice === 'failed'
                ? t('dashboardEditor.importFailed', {
                    defaultValue: 'Failed to import layout: invalid JSON',
                  })
                : t('dashboardEditor.importSuccess', {
                    defaultValue: 'Layout imported successfully',
                  })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
