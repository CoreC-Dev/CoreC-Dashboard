import {
  Activity,
  ArrowLeft,
  Bell,
  ChevronDown,
  Cpu,
  FileCode2,
  Gauge,
  Globe,
  LayoutDashboard,
  Moon,
  Network,
  Send,
  Settings,
  Sliders,
  Sun,
  Tag,
  TerminalSquare,
  Unplug,
} from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { cn } from '@/lib/utils'
import { useInstanceStore } from '@/stores/instanceStore'
import { useThemeStore } from '@/stores/themeStore'

type RailItem = {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export const AppShell: React.FC = () => {
  const { t } = useTranslation()
  const { i18n: i18nInst } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { id: instanceId } = useParams<{ id: string }>()
  const { instance, isConnected, isConnecting } = useConnection()
  const instances = useInstanceStore((s) => s.instances)
  const { theme, resolvedTheme, setTheme } = useThemeStore()

  const base = instanceId ? `/corec/${instanceId}` : ''

  const monitorItems: RailItem[] = [
    { path: `${base}/monitor/dashboard`, label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: `${base}/monitor/tags`, label: t('nav.tags'), icon: Tag },
    { path: `${base}/monitor/alerts`, label: t('nav.alerts'), icon: Bell },
  ]

  const adminItems: RailItem[] = [
    { path: `${base}/admin/drivers`, label: t('nav.drivers'), icon: Cpu },
    { path: `${base}/admin/transports`, label: t('nav.transports'), icon: Send },
    { path: `${base}/admin/rules`, label: t('nav.rules'), icon: Sliders },
    { path: `${base}/admin/write`, label: t('nav.write'), icon: TerminalSquare },
    { path: `${base}/admin/config`, label: t('nav.config'), icon: FileCode2 },
    { path: `${base}/admin/topology`, label: t('nav.topology'), icon: Network },
    { path: `${base}/admin/diagnostics`, label: t('nav.diagnostics'), icon: Gauge },
  ]

  const cycleTheme = () => {
    if (theme === 'system') setTheme('dark')
    else if (theme === 'dark') setTheme('light')
    else setTheme('system')
  }

  const toggleLanguage = () => {
    const nextLang = i18nInst.language.startsWith('zh') ? 'en' : 'zh-CN'
    setLocale(nextLang)
  }

  const statusColor = isConnecting
    ? 'bg-status-warning'
    : isConnected
      ? 'bg-status-running'
      : 'bg-status-error'

  const isMonitor = location.pathname.includes('/monitor')
  const isAdmin = location.pathname.includes('/admin')
  const monitorLink = instanceId ? `/corec/${instanceId}/monitor/dashboard` : '/'
  const adminLink = instanceId ? `/corec/${instanceId}/admin/drivers` : '/'

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {/* ===== Side rail (72px icon navigation) ===== */}
      <aside className="w-[72px] shrink-0 flex flex-col items-center gap-3 py-3 px-2 bg-card border-r border-border">
        {/* Brand mark */}
        <Link
          to="/"
          className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-white"
          style={{
            background: 'linear-gradient(135deg, #baf34d 0%, #54bb47 58%, #16824b 100%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,.35), 0 5px 12px rgba(74,179,67,.22)',
          }}
          aria-label="CoreC home"
        >
          <Activity className="w-4 h-4" strokeWidth={2.4} />
        </Link>

        {/* Monitor nav group */}
        <nav className="flex flex-col items-center gap-1.5 w-full">
          {monitorItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'relative w-9 h-9 rounded-full grid place-items-center transition-all duration-150',
                    isActive
                      ? 'bg-foreground text-background shadow-md'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )
                }
                title={item.label}
              >
                <Icon className="w-[18px] h-[18px]" />
              </NavLink>
            )
          })}
        </nav>

        {/* Divider */}
        <div className="w-8 h-px bg-border shrink-0" />

        {/* Admin nav group */}
        <nav className="flex flex-col items-center gap-1.5 w-full">
          {adminItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'relative w-9 h-9 rounded-full grid place-items-center transition-all duration-150',
                    isActive
                      ? 'bg-foreground text-background shadow-md'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )
                }
                title={item.label}
              >
                <Icon className="w-[18px] h-[18px]" />
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom: theme + disconnect */}
        <div className="mt-auto flex flex-col items-center gap-1.5 w-full">
          <button
            type="button"
            onClick={cycleTheme}
            className="w-9 h-9 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
            title={t('topbar.themeTooltip', { theme: t(`settings.${theme}`) })}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Moon className="w-[18px] h-[18px]" />
            ) : (
              <Sun className="w-[18px] h-[18px]" />
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-full grid place-items-center text-muted-foreground hover:text-status-error hover:bg-status-error/10 transition-all duration-150"
            title={t('connection.disconnect')}
            aria-label="Disconnect"
          >
            <Unplug className="w-[18px] h-[18px]" />
          </button>
        </div>
      </aside>

      {/* ===== Main content area ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Pill-shaped floating topbar */}
        <header className="flex items-center gap-2.5 px-5 py-3 shrink-0">
          {/* Brand pill (left) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('instances.backHome')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            {instance && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-semibold transition-colors"
                  >
                    <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor)} />
                    <span className="max-w-[140px] truncate">{instance.name}</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>{t('instances.switchInstance')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {instances.map((inst) => (
                    <DropdownMenuItem
                      key={inst.id}
                      onClick={() => {
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
                        className={cn(
                          'w-1.5 h-1.5 rounded-full mr-2 shrink-0',
                          inst.lastConnectedAt ? 'bg-status-running' : 'bg-status-idle',
                        )}
                      />
                      <span className="truncate">{inst.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Center: Monitor/Admin switcher */}
          <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-full bg-card border border-border shadow-sm">
            <Link
              to={monitorLink}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all',
                isMonitor
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('nav.monitor')}</span>
            </Link>
            <Link
              to={adminLink}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all',
                isAdmin
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('nav.admin')}</span>
            </Link>
          </div>

          {/* Right: language + live indicator */}
          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
              aria-label={t('common.toggleLanguage')}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{i18nInst.language.startsWith('zh') ? '中' : 'EN'}</span>
            </button>
            {isMonitor && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
                <span className="w-2 h-2 rounded-full bg-status-running glow-running" />
                <span className="text-xs font-semibold text-status-running">
                  {t('monitor.realtimeStreamConnected')}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-5 pb-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
