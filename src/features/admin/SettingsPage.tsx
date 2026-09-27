import { Download, Globe, HardDrive, Moon, RotateCcw, Save, Server, Sun } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { setLocale } from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'
import { useDashboardStore } from '@/stores/dashboardStore'
import { type ThemeMode, useThemeStore } from '@/stores/themeStore'

export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { baseUrl, secret, setConnection } = useConnectionStore()
  const { theme, setTheme } = useThemeStore()
  const { currentLayout, resetToDefault } = useDashboardStore()

  const [url, setUrl] = useState(baseUrl)
  const [token, setToken] = useState(secret)
  const [savedNotice, setSavedNotice] = useState(false)

  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault()
    setConnection(url, token)
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2000)
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t('nav.settings')}</h1>
        <p className="text-xs text-muted-foreground">
          CoreC server credentials, UI preferences, and dashboard layout backup
        </p>
      </div>

      {/* CoreC Endpoint Settings */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <Server className="w-4 h-4 text-primary" />
            <span>CoreC Engine Endpoint Connection</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Target REST and WebSocket host URL and Bearer security token
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
              <span>{savedNotice ? 'Saved!' : 'Update Credentials'}</span>
            </Button>
          </CardContent>
        </form>
      </Card>

      {/* Visual & Locale Preferences */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <Globe className="w-4 h-4 text-primary" />
            <span>Language & Theme Preferences</span>
          </CardTitle>
          <CardDescription className="text-xs">
            System defaults and personal display customisation
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
            <div>
              <div className="text-xs font-semibold text-foreground">Theme Mode</div>
              <div className="text-[11px] text-muted-foreground">
                Follow OS prefers-color-scheme or lock to dark/light
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
              <div className="text-xs font-semibold text-foreground">Interface Language (i18n)</div>
              <div className="text-[11px] text-muted-foreground">
                Chinese (zh-CN) / English (en)
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
            <span>Dashboard Layout Backup</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Export or reset your custom large-screen grid layout
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={exportLayoutJson} className="h-8 text-xs">
            <Download className="w-3.5 h-3.5 mr-1" />
            <span>Export Layout JSON</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            className="h-8 text-xs text-rose-400 hover:text-rose-500 hover:bg-rose-500/10"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            <span>Reset to Factory Default</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
