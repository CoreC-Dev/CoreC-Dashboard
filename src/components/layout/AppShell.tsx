import * as SelectPrimitive from '@radix-ui/react-select'
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileCode2,
  Gauge,
  Globe,
  LayoutDashboard,
  Menu,
  Moon,
  Network,
  Send,
  Server,
  Sliders,
  Sun,
  Tag,
  TerminalSquare,
  Unplug,
  X,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useConnection } from '@/contexts/ConnectionContext'
import { setLocale } from '@/i18n'
import { cn } from '@/lib/utils'
import { useInstanceStore } from '@/stores/instanceStore'
import { THEME_I18N_KEYS, THEME_VARIANTS, useThemeStore } from '@/stores/themeStore'

type RailItem = {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const SIDEBAR_KEY = 'corec_sidebar_collapsed'
const MOBILE_BP = 768

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < MOBILE_BP,
  )
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < MOBILE_BP)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
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
  const isMobile = useIsMobile()

  // Sidebar collapse state (desktop) — persisted in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(SIDEBAR_KEY) !== 'expanded'
  })

  // Mobile drawer open/close
  const [mobileOpen, setMobileOpen] = useState(false)

  // Theme trigger ref — used to anchor the circular-reveal view transition.
  const themeTriggerRef = useRef<HTMLButtonElement>(null)

  /**
   * Switch theme with a circular-reveal animation that expands from the
   * theme selector button position to cover the full screen. Uses the
   * View Transitions API (Chromium 111+); falls back to an instant
   * switch when the API is unavailable.
   */
  const handleThemeChange = (newTheme: string) => {
    const btn = themeTriggerRef.current
    if (!btn || !document.startViewTransition) {
      setTheme(newTheme as typeof theme)
      return
    }
    const rect = btn.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )
    document.documentElement.style.setProperty('--theme-x', `${x}px`)
    document.documentElement.style.setProperty('--theme-y', `${y}px`)
    document.documentElement.style.setProperty('--theme-r', `${endRadius}px`)
    document.startViewTransition(() => {
      flushSync(() => setTheme(newTheme as typeof theme))
    })
  }

  // Route progress bar
  const [progress, setProgress] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is an intentional trigger — re-run the progress-bar animation on every route change, not a value read in the body.
  useEffect(() => {
    setProgress(30)
    const t1 = setTimeout(() => setProgress(70), 80)
    const t2 = setTimeout(() => setProgress(100), 250)
    const t3 = setTimeout(() => setProgress(0), 500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [location.pathname])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded')
  }, [collapsed])

  // Close mobile drawer on route change
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is an intentional trigger — close the drawer on navigation, not a value read in the body.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Close mobile drawer when resizing to desktop
  useEffect(() => {
    if (!isMobile) setMobileOpen(false)
  }, [isMobile])

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

  // On mobile, sidebar is always expanded (drawer shows full text)
  const eff = isMobile ? false : collapsed

  const renderItem = (item: RailItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) =>
          cn(
            'relative grid place-items-center transition-all duration-200 group',
            eff ? 'w-9 h-9 rounded-full' : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
            isActive
              ? 'nav-indicator bg-foreground text-background shadow-md'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:translate-x-0.5',
          )
        }
        title={eff ? item.label : undefined}
      >
        <Icon className="w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
        {!eff && (
          <span className="text-sm font-medium truncate text-left flex-1">{item.label}</span>
        )}
      </NavLink>
    )
  }

  const renderGroupLabel = (label: string) => {
    if (eff) return null
    return (
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 px-2.5 pt-2 pb-1">
        {label}
      </span>
    )
  }

  // Shared sidebar content
  const sidebarContent = (
    <>
      {/* Brand mark */}
      <div className={cn('flex items-center shrink-0', eff ? 'justify-center' : 'px-0.5')}>
        <Link
          to="/"
          className="flex items-center gap-2.5 shrink-0"
          aria-label={t('aria.corecHome')}
        >
          <img src="/logo.svg" alt="CoreC" className="w-8 h-8 shrink-0" />
          {!eff && (
            <span className="font-extrabold text-base tracking-tight whitespace-nowrap">CoreC</span>
          )}
        </Link>
        {!eff && isMobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="w-7 h-7 rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 shrink-0 ml-auto"
            aria-label={t('aria.closeSidebar')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ===== Centered navigation area ===== */}
      <div className={cn('flex-1 flex flex-col justify-center', eff ? 'items-center' : '')}>
        {/* Monitor group label */}
        {renderGroupLabel(t('nav.monitor'))}

        {/* Monitor nav group */}
        <nav className={cn('flex flex-col w-full', eff ? 'gap-1.5 items-center' : 'gap-1')}>
          {monitorItems.map(renderItem)}
        </nav>

        {/* Admin group label */}
        {renderGroupLabel(t('nav.admin'))}

        {/* Admin nav group */}
        <nav className={cn('flex flex-col w-full', eff ? 'gap-1.5 items-center' : 'gap-1')}>
          {adminItems.map(renderItem)}
        </nav>
      </div>

      {/* ===== Bottom fixed function area ===== */}
      <div className={cn('shrink-0', eff ? 'pt-3' : 'pt-2')}>
        <div className={cn('h-px bg-border mb-2 shrink-0', eff ? 'w-8 mx-auto' : 'w-full')} />
        <div
          className={cn('flex w-full', eff ? 'flex-col items-center gap-1.5' : 'flex-col gap-1')}
        >
          {/* Instance switcher — dropdown (Select) */}
          {instance && (
            <Select
              value={instance.id}
              onValueChange={(id) => {
                const inst = instances.find((i) => i.id === id)
                if (!inst) return
                const space = isMonitor
                  ? 'monitor/dashboard'
                  : isAdmin
                    ? 'admin/drivers'
                    : 'monitor/dashboard'
                navigate(`/corec/${id}/${space}`)
              }}
            >
              <SelectPrimitive.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
                    eff
                      ? 'w-9 h-9 rounded-full'
                      : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
                  )}
                  aria-label={t('instances.switchInstance')}
                >
                  <span className="relative shrink-0">
                    <Server className="w-[18px] h-[18px]" />
                    <span
                      className={cn(
                        'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-card',
                        statusColor,
                      )}
                    />
                  </span>
                  {!eff && (
                    <>
                      <span className="text-sm font-medium truncate text-left flex-1">
                        {instance.name}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </>
                  )}
                </button>
              </SelectPrimitive.Trigger>
              <SelectContent side="right" align="start" className="w-56">
                {instances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          inst.lastConnectedAt ? 'bg-status-running' : 'bg-status-idle',
                        )}
                      />
                      <span className="truncate">{inst.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Language toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className={cn(
              'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
              eff
                ? 'w-9 h-9 rounded-full'
                : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
            )}
            aria-label={t('common.toggleLanguage')}
          >
            <Globe className="w-[18px] h-[18px] shrink-0" />
            {!eff && (
              <span className="text-sm font-medium truncate text-left flex-1">
                {i18nInst.language.startsWith('zh') ? '中文' : 'English'}
              </span>
            )}
          </button>

          {/* Theme selector — dropdown (Select) */}
          <Select value={theme} onValueChange={handleThemeChange}>
            <SelectPrimitive.Trigger asChild>
              <button
                ref={themeTriggerRef}
                type="button"
                className={cn(
                  'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
                  eff
                    ? 'w-9 h-9 rounded-full'
                    : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
                )}
                aria-label={t('aria.selectTheme')}
              >
                {resolvedTheme === 'dark' ? (
                  <Moon className="w-[18px] h-[18px] shrink-0" />
                ) : (
                  <Sun className="w-[18px] h-[18px] shrink-0" />
                )}
                {!eff && (
                  <>
                    <span className="text-sm font-medium truncate text-left flex-1">
                      {t(THEME_I18N_KEYS[theme])}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </>
                )}
              </button>
            </SelectPrimitive.Trigger>
            <SelectContent side="right" align="start" className="w-40">
              <SelectItem value="system">{t(THEME_I18N_KEYS.system)}</SelectItem>
              {THEME_VARIANTS.map((variant) => (
                <SelectItem key={variant} value={variant}>
                  {t(THEME_I18N_KEYS[variant])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Disconnect */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className={cn(
              'grid place-items-center text-muted-foreground hover:text-status-error hover:bg-status-error/10 transition-all duration-200',
              eff
                ? 'w-9 h-9 rounded-full'
                : 'w-full h-9 rounded-lg flex items-center px-2.5 gap-2.5',
            )}
            title={eff ? t('connection.disconnect') : undefined}
            aria-label={t('aria.disconnect')}
          >
            <Unplug className="w-[18px] h-[18px] shrink-0" />
            {!eff && (
              <span className="text-sm font-medium truncate text-left flex-1">
                {t('connection.disconnect')}
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="h-screen w-full bg-background text-foreground overflow-hidden md:flex md:p-4 md:gap-4 relative">
      {/* Subtle decorative gradient orb */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
        />
      </div>

      {/* ===== Route progress bar ===== */}
      {progress > 0 && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-[100] pointer-events-none">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* ===== Mobile sidebar (Radix Dialog-based sheet for a11y) ===== */}
      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="py-4 px-3"
            style={{ boxShadow: 'var(--shadow-panel)' }}
          >
            <SheetTitle>{t('aria.navigation')}</SheetTitle>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {/* ===== Desktop sidebar (floating panel in flex layout) ===== */}
      {!isMobile && (
        <aside
          className={cn(
            'sidebar-transition shrink-0 flex flex-col py-4 bg-card rounded-[20px] relative',
            collapsed ? 'w-[72px] px-2 gap-1 items-center' : 'w-[220px] px-3 gap-1',
          )}
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          {sidebarContent}
          {/* Floating collapse/expand toggle — sits on the sidebar's right edge */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-12 rounded-full bg-card border border-border shadow-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-110 transition-all duration-200"
            aria-label={collapsed ? t('aria.expandSidebar') : t('aria.collapseSidebar')}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </aside>
      )}

      {/* ===== Main content area ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
        {/* Topbar — back button (left) + realtime indicator (right) on the same row */}
        <header className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            {/* Hamburger (mobile only) */}
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground hover:shadow-md transition-all duration-200 shrink-0"
                aria-label={t('aria.openMenu')}
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            {/* Back button */}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground hover:shadow-md hover:-translate-x-0.5 transition-all duration-200 shrink-0"
              aria-label={t('instances.backHome')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Real-time stream indicator — same row as back button, right side */}
          {isMonitor && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-card border border-border shadow-sm">
              <span
                className={cn(
                  'w-2.5 h-2.5 rounded-full shrink-0',
                  isConnecting
                    ? 'bg-status-warning'
                    : isConnected
                      ? 'bg-status-running glow-running'
                      : 'bg-status-error glow-error',
                )}
              />
              <span
                className={cn(
                  'text-sm font-semibold',
                  isConnecting
                    ? 'text-status-warning'
                    : isConnected
                      ? 'text-status-running'
                      : 'text-status-error',
                )}
              >
                {isConnecting
                  ? t('monitor.realtimeStreamConnecting')
                  : isConnected
                    ? t('monitor.realtimeStreamConnected')
                    : t('monitor.realtimeStreamDisconnected')}
              </span>
            </div>
          )}
        </header>

        {/* Content — centered with max-width + page transition */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full max-w-[1400px] mx-auto px-5 pb-5 md:px-8 md:pb-8">
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </div>
        </main>

        {/* Footer — pinned to the bottom, does not scroll with content */}
        <footer className="shrink-0 py-3 border-t border-border flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>{t('common.footerText')}</span>
          <a
            href="https://github.com/CoreC-Dev/CoreC-Dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium transition-colors"
          >
            GitHub
          </a>
        </footer>
      </div>
    </div>
  )
}
