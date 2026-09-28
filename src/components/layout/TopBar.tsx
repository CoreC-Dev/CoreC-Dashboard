import {
  Activity,
  Globe,
  Maximize2,
  Minimize2,
  Moon,
  Radio,
  Settings,
  Sun,
  Unplug,
} from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { setLocale } from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'
import { useThemeStore } from '@/stores/themeStore'

export const TopBar: React.FC = () => {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { isConnected, baseUrl, serverName, serverVersion, disconnect } = useConnectionStore(
    useShallow((s) => ({
      isConnected: s.isConnected,
      baseUrl: s.baseUrl,
      serverName: s.serverName,
      serverVersion: s.serverVersion,
      disconnect: s.disconnect,
    })),
  )
  const { theme, resolvedTheme, setTheme } = useThemeStore(
    useShallow((s) => ({ theme: s.theme, resolvedTheme: s.resolvedTheme, setTheme: s.setTheme })),
  )
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  // Use the browser's fullscreenchange event as the single source of truth for
  // the isFullscreen state. The previous optimistic setIsFullscreen calls in
  // toggleFullscreen could desync from reality if requestFullscreen/exitFullscreen
  // failed silently (e.g. user pressed Esc, or the promise rejected). [L-2]
  React.useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const isMonitor = location.pathname.startsWith('/monitor')

  const toggleFullscreen = () => {
    // Guard against browsers where the Fullscreen API is absent or prefixed —
    // calling an undefined method throws synchronously before .catch() attaches.
    const el = document.documentElement
    const elAny = el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void
    }
    const docAny = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void
    }
    const enter = elAny.requestFullscreen ?? elAny.webkitRequestFullscreen
    const exit = docAny.exitFullscreen ?? docAny.webkitExitFullscreen
    if (!document.fullscreenElement) {
      if (enter) {
        try {
          const ret = enter.call(el)
          if (ret && typeof ret.catch === 'function') ret.catch(() => {})
        } catch {
          /* Fullscreen not available — state stays false via the listener */
        }
      }
    } else if (exit) {
      try {
        const ret = exit.call(document)
        if (ret && typeof ret.catch === 'function') ret.catch(() => {})
      } catch {
        /* exitFullscreen rejected — state corrected by fullscreenchange */
      }
    }
    // State is updated by the fullscreenchange listener above — no optimistic
    // update here, so we never desync from the browser's actual fullscreen state.
  }

  const cycleTheme = () => {
    if (theme === 'system') setTheme('dark')
    else if (theme === 'dark') setTheme('light')
    else setTheme('system')
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('zh') ? 'en' : 'zh-CN'
    setLocale(nextLang)
  }

  return (
    <header className="h-14 border-b border-border bg-card/60 backdrop-blur-md px-4 flex items-center justify-between z-30 sticky top-0">
      {/* Brand & Connection Badge */}
      <div className="flex items-center space-x-3">
        <Link to="/" className="flex items-center space-x-2 font-bold text-lg tracking-tight">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm glow-primary">
            <Radio className="w-4 h-4" />
          </div>
          <span className="font-extrabold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            CoreC
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono font-normal">
            Dashboard
          </span>
        </Link>

        {/* Server Connection status */}
        <div className="hidden sm:flex items-center pl-3 border-l border-border space-x-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-400 glow-success' : 'bg-rose-500'
            }`}
          />
          <span className="font-mono text-muted-foreground max-w-[160px] truncate" title={baseUrl}>
            {serverName || baseUrl.replace(/^https?:\/\//, '')}
          </span>
          {serverVersion && (
            <Badge variant="outline" className="text-[10px] font-mono py-0 h-4">
              v{serverVersion}
            </Badge>
          )}
        </div>
      </div>

      {/* Center Nav Switcher: Monitor vs Admin */}
      <div className="flex items-center bg-muted/70 p-1 rounded-lg border border-border/50 text-xs">
        <Link
          to="/monitor/dashboard"
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-all ${
            isMonitor
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>{t('nav.monitor')}</span>
        </Link>
        <Link
          to="/admin/drivers"
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-all ${
            !isMonitor
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{t('nav.admin')}</span>
        </Link>
      </div>

      {/* Right Action Icons */}
      <div className="flex items-center space-x-1 sm:space-x-2">
        {/* Fullscreen Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFullscreen}
          title={isFullscreen ? t('dashboard.exitFullscreen') : t('dashboard.enterFullscreen')}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>

        {/* Language Switcher */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className="h-8 px-2 text-xs font-mono text-muted-foreground hover:text-foreground flex items-center space-x-1"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{i18n.language.startsWith('zh') ? '中' : 'EN'}</span>
        </Button>

        {/* Theme Switcher */}
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          title={t('topbar.themeTooltip', { theme: t(`settings.${theme}`) })}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {resolvedTheme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>

        {/* Disconnect / Setup */}
        <Button
          variant="ghost"
          size="icon"
          onClick={disconnect}
          title={t('connection.disconnect')}
          className="h-8 w-8 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10"
        >
          <Unplug className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
