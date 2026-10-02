import { ArrowLeft, ChevronLeft, ChevronRight, Globe, Unplug } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { setLocale } from '@/i18n'
import { cn } from '@/lib/cn'
import { InstanceSelector } from './InstanceSelector'
import { buildAdminItems, buildMonitorItems, type RailItem } from './navItems'
import { ThemeSelector } from './ThemeSelector'

interface SidebarNavProps {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  isMobile: boolean
}

/**
 * Sidebar navigation content — brand mark, monitor/admin nav groups, the
 * collapse toggle, and the bottom function area (back home, instance
 * switcher, language toggle, theme selector, disconnect). Shared by the
 * mobile sheet and the desktop aside.
 */
export const SidebarNav: React.FC<SidebarNavProps> = ({ collapsed, setCollapsed, isMobile }) => {
  const { t, i18n: i18nInst } = useTranslation()
  const navigate = useNavigate()
  const { id: instanceId } = useParams<{ id: string }>()

  // On mobile, sidebar is always expanded (drawer shows full text)
  const eff = isMobile ? false : collapsed

  const base = instanceId ? `/corec/${instanceId}` : ''
  const monitorItems = buildMonitorItems(base)
  const adminItems = buildAdminItems(base)

  const toggleLanguage = () => {
    const nextLang = i18nInst.language.startsWith('zh') ? 'en' : 'zh-CN'
    setLocale(nextLang)
  }

  const renderItem = (item: RailItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) =>
          cn(
            'relative grid place-items-center transition-all duration-200 group',
            eff
              ? 'w-9 h-9 rounded-full'
              : 'w-full h-11 rounded-lg flex items-center px-2.5 gap-2.5',
            isActive
              ? 'nav-indicator bg-foreground text-background shadow-md'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:translate-x-0.5',
          )
        }
        title={eff ? t(item.labelKey) : undefined}
      >
        <Icon className="w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
        {!eff && (
          <span className="text-sm font-medium truncate text-left flex-1">{t(item.labelKey)}</span>
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

  return (
    <>
      {/* Brand mark — animated logo centered */}
      <div className={cn('flex items-center shrink-0', eff ? 'justify-center' : 'justify-center')}>
        <Link
          to="/"
          className="flex items-center justify-center shrink-0"
          aria-label={t('aria.corecHome')}
        >
          <img
            src="/logo-animated.svg"
            alt="CoreC"
            className={cn('shrink-0 transition-all duration-300', eff ? 'w-9 h-9' : 'w-28 h-28')}
          />
        </Link>
      </div>

      {/* ===== Centered navigation area — white bubble card ===== */}
      <div
        className={cn(
          'flex flex-col relative',
          isMobile ? '' : 'flex-1 justify-center',
          eff ? 'items-center' : '',
        )}
      >
        <div
          className={cn(
            'bg-card rounded-2xl border border-border/40',
            eff ? 'p-2 flex flex-col items-center gap-1.5' : 'p-2.5 flex flex-col w-full gap-1',
          )}
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
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
        {/* Floating collapse/expand toggle — at the center height of the nav bubble */}
        {!isMobile && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="absolute top-1/2 -translate-y-1/2 -right-3 z-20 w-6 h-12 rounded-full bg-card border border-border shadow-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-110 transition-all duration-200"
            aria-label={collapsed ? t('aria.expandSidebar') : t('aria.collapseSidebar')}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* ===== Bottom fixed function area — white bubble card ===== */}
      <div className="shrink-0">
        <div
          className={cn(
            'bg-card rounded-2xl border border-border/40',
            eff ? 'p-2 flex flex-col items-center gap-1.5' : 'p-2.5 flex flex-col w-full gap-1',
          )}
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          {/* Back to home */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className={cn(
              'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
              eff
                ? 'w-9 h-9 rounded-full'
                : 'w-full h-11 rounded-lg flex items-center px-2.5 gap-2.5',
            )}
            aria-label={t('instances.backHome')}
          >
            <ArrowLeft className="w-[18px] h-[18px] shrink-0" />
            {!eff && (
              <span className="text-sm font-medium truncate text-left flex-1">
                {t('instances.backHome')}
              </span>
            )}
          </button>

          {/* Instance switcher — dropdown (Select) */}
          <InstanceSelector eff={eff} />

          {/* Language toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className={cn(
              'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
              eff
                ? 'w-9 h-9 rounded-full'
                : 'w-full h-11 rounded-lg flex items-center px-2.5 gap-2.5',
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
          <ThemeSelector eff={eff} />

          {/* Disconnect */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className={cn(
              'grid place-items-center text-muted-foreground hover:text-status-error hover:bg-status-error/10 transition-all duration-200',
              eff
                ? 'w-9 h-9 rounded-full'
                : 'w-full h-11 rounded-lg flex items-center px-2.5 gap-2.5',
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
}
