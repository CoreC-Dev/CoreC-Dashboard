import { ArrowLeft, ChevronLeft, ChevronRight, Globe } from 'lucide-react'
import type React from 'react'
import { Fragment, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, matchPath, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { InstanceSelector } from '@/components/layout/InstanceSelector'
import { buildAdminGroups, buildMonitorItems, type RailItem } from '@/components/layout/navItems'
import { StreamStatusBadge } from '@/components/layout/StreamStatusBadge'
import { ThemeSelector } from '@/components/layout/ThemeSelector'
import { useNavIndicator } from '@/components/layout/useNavIndicator'
import { setLocale } from '@/i18n'
import { cn } from '@/lib/cn'
import { useAlertStore } from '@/stores/alertStore'

interface SidebarNavProps {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  isMobile: boolean
}

/**
 * Unread-alert count pill for the "告警事件" nav item.
 *
 * Data source is the instance-level alert provider's store: unread error
 * events win; with none unread, a non-empty dead-letter queue is the
 * fallback signal ("deadLetters>0 或收到 error 级事件时显示红色计数").
 * The aria label uses the audit's copy — "{{count}} unread alerts" — and
 * participates in the nav link's accessible name, so screen readers hear
 * the count, not just "Alerts & Events".
 */
const AlertsNavBadge: React.FC = () => {
  const { t } = useTranslation()
  const count = useAlertStore((s) =>
    s.unreadErrorCount > 0 ? s.unreadErrorCount : s.deadLetterCount,
  )
  if (count <= 0) return null
  const label = count > 99 ? '99+' : String(count)
  return (
    <span
      role="status"
      aria-label={t('alerts.unreadBadgeAria', { count })}
      className={cn(
        'absolute min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-[18px] text-center',
        'bg-status-error text-white shadow-sm pointer-events-none',
        // Top-right corner: hugs the icon circle when collapsed, the row's
        // right edge when expanded.
        '-top-1 -right-1.5',
      )}
    >
      {label}
    </span>
  )
}

/**
 * Sidebar navigation content — brand mark, monitor/admin nav groups, the
 * collapse toggle, and the bottom function area (back to the instance
 * list, instance switcher, language toggle, theme selector). Shared by the
 * mobile sheet and the desktop aside.
 *
 * The old bottom-area "Disconnect" button was removed — it only
 * called navigate('/'), byte-identical to "Back to instances" above it,
 * while its label promised a distinct action. Leaving the instance route
 * tree already tears the connection down for real: ConnectionProvider's
 * unmount cleanups clear the active connection, evict the per-instance
 * QueryClient and stop the probe, and every WebSocket unmounts with it.
 * One honest button remains, labeled like every other escape in the app
 * ("Back to instances" — the same copy as ConnectionGate's failure screen).
 */
export const SidebarNav: React.FC<SidebarNavProps> = ({ collapsed, setCollapsed, isMobile }) => {
  const { t, i18n: i18nInst } = useTranslation()
  const navigate = useNavigate()
  const { id: instanceId } = useParams<{ id: string }>()

  // On mobile, sidebar is always expanded (drawer shows full text)
  const eff = isMobile ? false : collapsed

  const base = instanceId ? `/corec/${instanceId}` : ''
  const monitorItems = buildMonitorItems(base)
  const adminGroups = buildAdminGroups(base)

  // Sliding active-item indicator: measure the active nav link and overlay a
  // rounded highlight that slides between items with a small bounce.
  // matchPath defaults to end:true (exact), but NavLink defaults to end:false
  // (prefix) — use end:false here so detail sub-routes (e.g. drivers/:name)
  // still highlight the parent nav item, keeping the indicator and the text
  // color in sync.
  const { pathname } = useLocation()
  const navItems = [...monitorItems, ...adminGroups.flatMap((g) => g.items)]
  const activeItem = navItems.find((item) => matchPath({ path: item.path, end: false }, pathname))
  const activeKey = activeItem?.path

  const navContainerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const indicator = useNavIndicator(navContainerRef, itemRefs, activeKey, eff)

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
        ref={(el) => {
          if (el) itemRefs.current.set(item.path, el)
          else itemRefs.current.delete(item.path)
        }}
        className={({ isActive }) =>
          cn(
            'relative z-10 grid place-items-center transition-all duration-200 group',
            eff
              ? 'w-9 h-9 rounded-full'
              : 'w-full h-11 rounded-lg flex items-center px-2.5 gap-2.5',
            isActive
              ? 'text-background'
              : // No hover translation on purpose. The nav container clips
                // at its right edge (overflow-x-hidden), so the old 2px
                // rightward nudge pushed collapsed circles — and expanded
                // rows — 2px under the clip: the icon read as off-center
                // inside the circle and the circle's right edge looked cut
                // off. The icon keeps its centered scale-up instead
                // (group-hover:scale-110 below), which scales around the
                // circle's center and can never leave it.
                'text-muted-foreground hover:text-foreground hover:bg-muted',
          )
        }
        title={eff ? t(item.labelKey) : undefined}
      >
        <Icon className="w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
        {!eff && (
          <span className="text-sm font-medium truncate text-left flex-1">{t(item.labelKey)}</span>
        )}
        {item.badge === 'alerts' && <AlertsNavBadge />}
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

  // Sub-group label inside a section — one size smaller than the
  // section label so the hierarchy reads at a glance. In the collapsed
  // rail the text would not fit, so a hairline divider keeps the halves
  // separable instead of a wall of bare icons.
  const renderSubgroupLabel = (label: string) => {
    if (eff) {
      return <div aria-hidden className="w-6 h-px bg-border/70 my-1.5 shrink-0" />
    }
    return (
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 px-2.5 pt-1.5 pb-0.5 truncate">
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

      {/* Live-stream status directly under the brand mark — connection
          state belongs to the app chrome, not to a page. Dot only; the
          label shows on hover (title) and for screen readers (aria). */}
      <StreamStatusBadge />

      {/* ===== Centered navigation area — white bubble card ===== */}
      <div
        className={cn(
          'flex flex-col relative',
          isMobile ? '' : 'flex-1 justify-center min-h-0',
          eff ? 'items-center' : '',
        )}
      >
        <div
          className={cn(
            'bg-card rounded-3xl squircle border border-border/40 flex flex-col',
            eff ? 'p-2' : 'p-2.5',
            !isMobile && 'max-h-full overflow-hidden',
          )}
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div
            ref={navContainerRef}
            className={cn(
              'relative flex flex-col min-h-0 overflow-y-auto overflow-x-hidden',
              eff ? 'items-center gap-1.5' : 'w-full gap-1',
            )}
          >
            {/* Monitor group label */}
            {renderGroupLabel(t('nav.monitor'))}

            {/* Monitor nav group */}
            <nav className={cn('flex flex-col w-full', eff ? 'gap-1.5 items-center' : 'gap-1')}>
              {monitorItems.map(renderItem)}
            </nav>

            {/* Admin group label */}
            {renderGroupLabel(t('nav.admin'))}

            {/* Admin sub-groups: configuration management vs
                 operations & diagnostics, each with its own small label. */}
            {adminGroups.map((group) => (
              <Fragment key={group.labelKey}>
                {renderSubgroupLabel(t(group.labelKey))}
                <nav className={cn('flex flex-col w-full', eff ? 'gap-1.5 items-center' : 'gap-1')}>
                  {group.items.map(renderItem)}
                </nav>
              </Fragment>
            ))}

            {/* Sliding active-item highlight — measured overlay behind the links */}
            <div aria-hidden className="z-0 bg-foreground shadow-md" style={indicator.style} />
          </div>
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
            'bg-card rounded-3xl squircle border border-border/40',
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
        </div>
      </div>
    </>
  )
}
