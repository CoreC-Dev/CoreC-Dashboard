import {
  Activity,
  ArrowLeft,
  ChevronDown,
  Globe,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  Settings,
  Sun,
  Unplug,
} from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConnection } from '@/contexts/ConnectionContext'
import { setLocale } from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'
import { useThemeStore } from '@/stores/themeStore'

export const TopBar: React.FC<{ onMenuClick?: () => void }> = ({ onMenuClick }) => {
  const { t } = useTranslation()
  const { i18n: i18nInst } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { id: instanceId } = useParams<{ id: string }>()
  const { instance, isConnected, isConnecting, serverInfo } = useConnection()
  const instances = useInstanceStore((s) => s.instances)

  const { theme, resolvedTheme, setTheme } = useThemeStore()
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  React.useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const isMonitor = location.pathname.includes('/monitor')
  const isAdmin = location.pathname.includes('/admin')

  const toggleFullscreen = () => {
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
          /* Fullscreen not available */
        }
      }
    } else if (exit) {
      try {
        const ret = exit.call(document)
        if (ret && typeof ret.catch === 'function') ret.catch(() => {})
      } catch {
        /* exitFullscreen rejected */
      }
    }
  }

  const cycleTheme = () => {
    if (theme === 'system') setTheme('dark')
    else if (theme === 'dark') setTheme('light')
    else setTheme('system')
  }

  const toggleLanguage = () => {
    const nextLang = i18nInst.language.startsWith('zh') ? 'en' : 'zh-CN'
    setLocale(nextLang)
  }

  const handleDisconnect = () => {
    navigate('/')
  }

  const statusDot = isConnecting
    ? 'bg-status-warning animate-pulse'
    : isConnected
      ? 'bg-status-running'
      : 'bg-status-error'

  // Build the Monitor/Admin switch links based on current instance
  const monitorLink = instanceId ? `/corec/${instanceId}/monitor/dashboard` : '/'
  const adminLink = instanceId ? `/corec/${instanceId}/admin/drivers` : '/'

  return (
    <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between z-30 sticky top-0">
      {/* Left: back + instance name + switcher */}
      <div className="flex items-center space-x-3 min-w-0">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            aria-label={t('nav.admin')}
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 md:hidden"
          >
            <Menu className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          title={t('instances.backHome')}
          aria-label={t('instances.backHome')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <img src="/logo.svg" alt="CoreC" className="w-6 h-6 shrink-0" />

        {instance && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center space-x-2 px-2 py-1 rounded-md hover:bg-muted/60 transition-colors min-w-0"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                <span className="font-medium text-sm truncate max-w-[160px]">{instance.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>{t('instances.switchInstance')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {instances.map((inst) => (
                <DropdownMenuItem
                  key={inst.id}
                  onClick={() => {
                    // Navigate to the same space (monitor/admin) on the new instance
                    const space = isMonitor
                      ? 'monitor/dashboard'
                      : isAdmin
                        ? 'admin/drivers'
                        : 'monitor/dashboard'
                    navigate(`/corec/${inst.id}/${space}`)
                  }}
                  className={inst.id === instance.id ? 'bg-accent' : ''}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${
                      inst.lastConnectedAt ? 'bg-status-running' : 'bg-status-idle'
                    }`}
                  />
                  <span className="truncate">{inst.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {serverInfo?.version && (
          <Badge
            variant="outline"
            className="text-[10px] font-mono py-0 h-4 shrink-0 hidden sm:flex"
          >
            v{serverInfo.version}
          </Badge>
        )}
      </div>

      {/* Center: Monitor / Admin switcher */}
      <div className="flex items-center bg-muted/70 p-1 rounded-lg border border-border text-xs shrink-0">
        <Link
          to={monitorLink}
          className={`flex items-center space-x-1.5 px-2 sm:px-3 py-1 rounded-md transition-all ${
            isMonitor
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('nav.monitor')}</span>
        </Link>
        <Link
          to={adminLink}
          className={`flex items-center space-x-1.5 px-2 sm:px-3 py-1 rounded-md transition-all ${
            isAdmin
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('nav.admin')}</span>
        </Link>
      </div>

      {/* Right: fullscreen, theme, language, disconnect */}
      <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFullscreen}
          title={isFullscreen ? t('dashboard.exitFullscreen') : t('dashboard.enterFullscreen')}
          aria-label={isFullscreen ? t('dashboard.exitFullscreen') : t('dashboard.enterFullscreen')}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          title={t('topbar.themeTooltip', { theme: t(`settings.${theme}`) })}
          aria-label={t('topbar.themeTooltip', { theme: t(`settings.${theme}`) })}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {resolvedTheme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          aria-label={t('common.toggleLanguage')}
          className="h-8 px-2 text-xs font-mono text-muted-foreground hover:text-foreground flex items-center space-x-1"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{i18nInst.language.startsWith('zh') ? '中' : 'EN'}</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleDisconnect}
          title={t('connection.disconnect')}
          aria-label={t('connection.disconnect')}
          className="h-8 w-8 text-status-error hover:text-status-error hover:bg-status-error/10"
        >
          <Unplug className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
