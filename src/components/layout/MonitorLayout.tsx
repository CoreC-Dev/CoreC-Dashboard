import { Bell, LayoutDashboard, Tag } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { TopBar } from './TopBar'

export const MonitorLayout: React.FC = () => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()

  const base = id ? `/corec/${id}/monitor` : '/monitor'

  const tabs = [
    { path: `${base}/dashboard`, label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: `${base}/tags`, label: t('nav.tags'), icon: Tag },
    { path: `${base}/alerts`, label: t('nav.alerts'), icon: Bell },
  ]

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar />

      {/* Monitor Sub-Nav Strip */}
      <div className="h-10 border-b border-border bg-card/30 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 text-xs overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center space-x-1.5 px-3 py-1 rounded-md transition-colors shrink-0',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                  )
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </NavLink>
            )
          })}
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center space-x-1.5 shrink-0 ml-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span>{t('monitor.realtimeStreamConnected')}</span>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/5">
        <Outlet />
      </main>
    </div>
  )
}
