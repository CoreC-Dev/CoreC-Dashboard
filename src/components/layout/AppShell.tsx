import {
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
  Server,
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

  const renderGroupLabel = (label: string) => {
    if (collapsed) return null
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2.5 pt-1 pb-0.5">
        {label}
      </span>
    )
  }

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden p-4 gap-4">
      {/* ===== Floating sidebar ===== */}
      <aside
        className={cn(
          'sidebar-transition shrink-0 flex flex-col py-4 bg-card rounded-[20px] overflow-hidden',
          collapsed ? 'w-[72px] px-2 gap-1 items-center' : 'w-[220px] px-3 gap-1',
        )}
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        {/* Brand mark + collapse toggle */}
        <div
          className={cn(
            'flex items-center shrink-0',
            collapsed ? 'flex-col gap-2' : 'justify-between px-0.5',
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

        {/* Expand button (collapsed state) */}
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

        {/* Monitor group label */}
        {renderGroupLabel(t('nav.monitor'))}

        {/* Monitor nav group */}
        <nav className={cn('flex flex-col w-full', collapsed ? 'gap-1.5 items-center' : 'gap-1')}>
          {monitorItems.map(renderItem)}
        </nav>

        {/* Admin group label */}
        {renderGroupLabel(t('nav.admin'))}

        {/* Admin nav group */}
        <nav className={cn('flex flex-col w-full', collapsed ? 'gap-1.5 items-center' : 'gap-1')}>
          {adminItems.map(renderItem)}
        </nav>

        {/* ===== Bottom fixed function area ===== */}
        <div className={cn('mt-auto', collapsed ? 'pt-3' : 'pt-2')}>
          <div
            className={cn('h-px bg-border mb-2 shrink-0', collapsed ? 'w-8 mx-auto' : 'w-full')}
          />
          <div
            className={cn(
              'flex w-full',
              collapsed ? 'flex-col items-center gap-1.5' : 'flex-col gap-1',
            )}
          >
            {/* Instance switcher */}
            {instance && (
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
                    aria-label={t('instances.switchInstance')}
                  >
                    <Server className="w-[18px] h-[18px] shrink-0" />
                    {!collapsed && (
                      <span className="text-sm font-medium truncate text-left flex-1">
                        {instance.name}
                      </span>
                    )}
                    {!collapsed && (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" className="w-56">
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

            {/* Language toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className={cn(
                'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
                collapsed
                  ? 'w-9 h-9 rounded-full'
                  : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
              )}
              aria-label={t('common.toggleLanguage')}
            >
              <Globe className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium truncate text-left flex-1">
                  {i18nInst.language.startsWith('zh') ? '中文' : 'English'}
                </span>
              )}
            </button>

            {/* Theme selector */}
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

            {/* Disconnect */}
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
        </div>
      </aside>

      {/* ===== Main content area ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar — back button + live indicator */}
        <header className="flex items-center gap-2.5 px-5 py-3 shrink-0">
          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground hover:shadow-md transition-all duration-200 shrink-0"
            aria-label={t('instances.backHome')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Right: live indicator */}
          <div className="ml-auto flex items-center gap-2.5">
            {instance && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
                <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor)} />
                <span className="text-xs font-semibold text-muted-foreground">{instance.name}</span>
              </div>
            )}
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
