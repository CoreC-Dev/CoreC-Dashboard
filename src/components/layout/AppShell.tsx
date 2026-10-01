import {
  Activity,
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  Cpu,
  FileCode2,
  Gauge,
  Globe,
  LayoutDashboard,
  Moon,
  Network,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Settings,
  Sliders,
  Sun,
  Tag,
  TerminalSquare,
  Unplug,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
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
import { THEME_LABELS, THEME_VARIANTS, useThemeStore } from '@/stores/themeStore'

type RailItem = {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const SIDEBAR_KEY = 'corec_sidebar_collapsed'

export const AppShell: React.FC = () => {
  const { t } = useTranslation()
  const { i18n: i18nInst } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { id: instanceId } = useParams<{ id: string }>()
  const { instance, isConnected, isConnecting } = useConnection()
  const instances = useInstanceStore((s) => s.instances)
  const { theme, resolvedTheme, setTheme } = useThemeStore()

  // Sidebar collapse state — persisted in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(SIDEBAR_KEY) !== 'expanded'
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded')
  }, [collapsed])

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

  const renderItem = (item: RailItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) =>
          cn(
            'relative grid place-items-center transition-all duration-200 group',
            collapsed
              ? 'w-9 h-9 rounded-full'
              : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
            isActive
              ? 'bg-foreground text-background shadow-md'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:translate-x-0.5',
          )
        }
        title={collapsed ? item.label : undefined}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
        {!collapsed && (
          <span className="text-sm font-medium truncate text-left flex-1">{item.label}</span>
        )}
      </NavLink>
    )
  }

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {/* ===== Side rail — collapsible icon/text navigation ===== */}
      <aside
        className={cn(
          'sidebar-transition shrink-0 flex flex-col py-3 bg-card border-r border-border overflow-hidden',
          collapsed ? 'w-[72px] px-2 gap-3 items-center' : 'w-[220px] px-3 gap-2',
        )}
      >
        {/* Brand mark + toggle */}
        <div
          className={cn(
            'flex items-center shrink-0',
            collapsed ? 'justify-center' : 'justify-between px-0.5',
          )}
        >
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="CoreC home">
            <img src="/logo.svg" alt="CoreC" className="w-8 h-8 shrink-0" />
            {!collapsed && (
              <span className="font-extrabold text-base tracking-tight whitespace-nowrap">
                CoreC
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="w-7 h-7 rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 shrink-0"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapse toggle (when collapsed — show expand button) */}
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="w-9 h-9 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 shrink-0"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="w-[18px] h-[18px]" />
          </button>
        )}

        {/* Monitor nav group */}
        <nav className={cn('flex flex-col w-full', collapsed ? 'gap-1.5 items-center' : 'gap-1')}>
          {monitorItems.map(renderItem)}
        </nav>

        {/* Divider */}
        <div className={cn('h-px bg-border shrink-0', collapsed ? 'w-8' : 'w-full')} />

        {/* Admin nav group */}
        <nav className={cn('flex flex-col w-full', collapsed ? 'gap-1.5 items-center' : 'gap-1')}>
          {adminItems.map(renderItem)}
        </nav>

        {/* Bottom: theme + disconnect */}
        <div
          className={cn(
            'mt-auto flex w-full',
            collapsed ? 'flex-col items-center gap-1.5' : 'flex-col gap-1',
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
                  collapsed
                    ? 'w-9 h-9 rounded-full'
                    : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
                )}
                aria-label="Select theme"
              >
                {resolvedTheme === 'dark' ? (
                  <Moon className="w-[18px] h-[18px] shrink-0" />
                ) : (
                  <Sun className="w-[18px] h-[18px] shrink-0" />
                )}
                {!collapsed && (
                  <span className="text-sm font-medium truncate text-left flex-1">
                    {THEME_LABELS[theme]}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-40">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5" />
                {t('settings.theme', { defaultValue: 'Theme' })}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setTheme('system')}
                className="flex items-center justify-between"
              >
                <span>{THEME_LABELS.system}</span>
                {theme === 'system' && <Check className="w-3.5 h-3.5" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {THEME_VARIANTS.map((variant) => (
                <DropdownMenuItem
                  key={variant}
                  onClick={() => setTheme(variant)}
                  className="flex items-center justify-between"
                >
                  <span>{THEME_LABELS[variant]}</span>
                  {theme === variant && <Check className="w-3.5 h-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => navigate('/')}
            className={cn(
              'grid place-items-center text-muted-foreground hover:text-status-error hover:bg-status-error/10 transition-all duration-200',
              collapsed
                ? 'w-9 h-9 rounded-full'
                : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
            )}
            title={collapsed ? t('connection.disconnect') : undefined}
            aria-label="Disconnect"
          >
            <Unplug className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && (
              <span className="text-sm font-medium truncate text-left flex-1">
                {t('connection.disconnect')}
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* ===== Main content area ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Pill-shaped floating topbar */}
        <header className="flex items-center gap-2.5 px-5 py-3 shrink-0">
          {/* Brand pill (left) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm transition-all duration-200 hover:shadow-md">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-muted-foreground hover:text-foreground transition-colors duration-200"
              aria-label={t('instances.backHome')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            {instance && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-semibold transition-colors duration-200"
                  >
                    <span
                      className={cn('w-2 h-2 rounded-full shrink-0 transition-colors', statusColor)}
                    />
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
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200',
                isMonitor
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('nav.monitor')}</span>
            </Link>
            <Link
              to={adminLink}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200',
                isAdmin
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm text-xs font-semibold text-muted-foreground hover:text-foreground hover:shadow-md transition-all duration-200"
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

        {/* Content — centered with max-width + page transition */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1280px] mx-auto w-full px-5 pb-5">
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
