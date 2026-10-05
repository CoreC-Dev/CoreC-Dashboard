import { Menu } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { TopProgressBar } from '@/components/layout/TopProgressBar'
import { useSidebarState } from '@/components/layout/useSidebarState'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useConnection } from '@/contexts/ConnectionContext'
import { useAutoLoadConfig } from '@/hooks/useAutoLoadConfig'
import { cn } from '@/lib/cn'

export const AppShell: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const { isConnected, isConnecting } = useConnection()
  const { isMobile, collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebarState()

  // Seed configStore from the live server config on first admin mount so
  // list pages (Drivers/Transports/Rules) have a populated working config
  // before the operator clicks "Create".  Without this, the first Create
  // calls resetToEmpty() and silently drops global.api from the server config.
  useAutoLoadConfig()

  const isMonitor = location.pathname.includes('/monitor')

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
          {isMonitor && (
            <span
              role="status"
              className={cn(
                'w-2.5 h-2.5 rounded-full shrink-0 ml-auto transition-colors duration-300',
                isConnecting
                  ? 'bg-status-warning'
                  : isConnected
                    ? 'bg-status-running glow-running'
                    : 'bg-status-error glow-error',
              )}
              aria-label={
                isConnecting
                  ? t('monitor.realtimeStreamConnecting')
                  : isConnected
                    ? t('monitor.realtimeStreamConnected')
                    : t('monitor.realtimeStreamDisconnected')
              }
            />
          )}
        </header>
      )}

      {/* Content — floating white rounded card, aligned with sidebar */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="w-full p-2 md:py-4 md:px-0 flex-1 flex flex-col">
          <div
            className="bg-card rounded-2xl px-5 py-5 md:px-8 md:py-8 flex-1 border border-border/40 relative"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            {/* Real-time stream indicator — floating top-right inside the card (desktop only; mobile uses the topbar dot) */}
            {isMonitor && (
              <div className="hidden md:block absolute top-7 right-8 z-10">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/60">
                  <span
                    className={cn(
                      'w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300',
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
              </div>
            )}

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
