import { Menu } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AlertStreamProvider } from '@/components/layout/AlertStreamProvider'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { StreamStatusBanner } from '@/components/layout/StreamStatusBanner'
import { TopProgressBar } from '@/components/layout/TopProgressBar'
import { useSidebarState } from '@/components/layout/useSidebarState'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAutoLoadConfig } from '@/hooks/useAutoLoadConfig'
import { cn } from '@/lib/cn'
import { deriveAggregate, useWsStatusStore, type WsAggregate } from '@/stores/wsStatusStore'

/**
 * Visual mapping for the "实时流" indicator — bound to the AGGREGATED state of
 * the live WebSocket streams (wsStatusStore), not the one-shot HTTP probe the
 * indicator used to reflect (audit B01: the badge stayed green while every
 * stream was frozen). 'idle' (no stream mounted yet) reads as "connecting".
 */
const streamBadgeTone = (
  aggregate: WsAggregate,
): { dot: string; text: string; labelKey: string } => {
  switch (aggregate) {
    case 'open':
      return {
        dot: 'bg-status-running glow-running',
        text: 'text-status-running',
        labelKey: 'monitor.realtimeStreamConnected',
      }
    case 'down':
      return {
        dot: 'bg-status-error glow-error',
        text: 'text-status-error',
        labelKey: 'monitor.realtimeStreamDisconnected',
      }
    case 'rejected':
      return {
        dot: 'bg-status-error glow-error',
        text: 'text-status-error',
        labelKey: 'monitor.realtimeStreamRejected',
      }
    default:
      // 'connecting' | 'idle'
      return {
        dot: 'bg-status-warning',
        text: 'text-status-warning',
        labelKey: 'monitor.realtimeStreamConnecting',
      }
  }
}

export const AppShell: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const aggregate = useWsStatusStore((s) => deriveAggregate(s.streams))
  const tone = streamBadgeTone(aggregate)
  const { isMobile, collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebarState()

  // Seed configStore from the live server config on first admin mount so
  // list pages (Drivers/Transports/Rules) have a populated working config
  // before the operator clicks "Create".  Without this, the first Create
  // calls resetToEmpty() and silently drops global.api from the server config.
  useAutoLoadConfig()

  // Main content area — shared by mobile (full-width) and desktop (inside the centered group)
  const mainArea = (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
      {/* Mobile-only topbar with hamburger, brand, and connection status */}
      {isMobile && (
        <header className="flex items-center justify-between px-4 py-3 shrink-0 gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground hover:shadow-md transition-all duration-200 shrink-0"
            aria-label={t('aria.openMenu')}
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link to="/" className="flex items-center shrink-0" aria-label={t('aria.corecHome')}>
            <img src="/logo-animated.svg" alt="CoreC" className="w-8 h-8 shrink-0" />
          </Link>
          {isMobile && (
            <span
              role="status"
              className={cn(
                'w-2.5 h-2.5 rounded-full shrink-0 ml-auto transition-colors duration-300',
                tone.dot,
              )}
              aria-label={t(tone.labelKey)}
            />
          )}
        </header>
      )}

      {/* Content — floating white rounded card, aligned with sidebar */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="w-full p-2 md:py-4 md:px-0 flex-1 flex flex-col">
          {/* Page-level stream banner — surfaces disconnected / gave-up /
              rate-limited states with a retry entry point for rejected
              streams (audit B01/D-02). Mounted on EVERY instance route
              (D-04): on admin pages the AppShell-level /logs alert stream
              is live, and write-control/config pages are exactly where a
              silent dead socket hurts most. Renders nothing when healthy. */}
          <StreamStatusBanner />
          <div
            className="bg-card rounded-2xl px-5 py-5 md:px-8 md:py-8 flex-1 border border-border/40 relative"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            {/* Real-time stream indicator — floating top-right inside the
                card on every instance route (desktop only; mobile uses the
                topbar dot). D-04: was monitor-only, leaving the seven admin
                pages with no connection status at all; the InstanceSelector
                dot covers the HTTP probe, this covers the live streams. */}
            <div className="hidden md:block absolute top-7 right-8 z-10">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/60">
                <span
                  className={cn(
                    'w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300',
                    tone.dot,
                  )}
                />
                <span className={cn('text-sm font-semibold', tone.text)}>{t(tone.labelKey)}</span>
              </div>
            </div>

            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </div>
  )

  return (
    <div className="h-screen w-full bg-background text-foreground overflow-hidden relative">
      {/* Instance-level alert subscription (audit B02): keeps the /logs
          warn/error stream, sound, browser notifications, and the sidebar
          badge alive on EVERY route of the instance — not just the alerts
          page. Behavior-only provider; renders nothing. */}
      <AlertStreamProvider />
      {/* Subtle decorative gradient orb */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
        />
      </div>

      {/* ===== Route progress bar (composited transform, no layout thrash) ===== */}
      <TopProgressBar />

      {/* ===== Mobile sidebar (Radix Dialog-based sheet for a11y) ===== */}
      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="py-4 px-3"
            style={{ boxShadow: 'var(--shadow-panel)' }}
          >
            <SheetTitle>{t('aria.navigation')}</SheetTitle>
            <div className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
              <SidebarNav collapsed={collapsed} setCollapsed={setCollapsed} isMobile={isMobile} />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ===== Desktop: centered group — sidebar hugs the content card, symmetric blank on both sides ===== */}
      {!isMobile ? (
        <div
          className="h-full mx-auto flex gap-4 py-4 px-4"
          style={{ maxWidth: `calc(${collapsed ? 72 : 220}px + 1448px)` }}
        >
          <aside
            className={cn(
              'sidebar-transition shrink-0 flex flex-col py-4',
              collapsed ? 'w-[72px] px-2 gap-2.5 items-center' : 'w-[220px] px-3 gap-2.5',
            )}
          >
            <SidebarNav collapsed={collapsed} setCollapsed={setCollapsed} isMobile={isMobile} />
          </aside>
          {mainArea}
        </div>
      ) : (
        mainArea
      )}
    </div>
  )
}
