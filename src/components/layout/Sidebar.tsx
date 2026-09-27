import {
  Cpu,
  FileCode2,
  Gauge,
  LayoutGrid,
  Network,
  Radio,
  Send,
  Sliders,
  TerminalSquare,
  Wrench,
} from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

export const Sidebar: React.FC = () => {
  const { t } = useTranslation()

  const navGroups = [
    {
      title: 'South & Northbound',
      items: [
        { path: '/admin/drivers', label: t('nav.drivers'), icon: Cpu },
        { path: '/admin/transports', label: t('nav.transports'), icon: Send },
        { path: '/admin/rules', label: t('nav.rules'), icon: Sliders },
      ],
    },
    {
      title: 'Control Plane',
      items: [
        { path: '/admin/write', label: t('nav.write'), icon: TerminalSquare },
        { path: '/admin/dashboard-editor', label: t('nav.dashboardEditor'), icon: LayoutGrid },
        { path: '/admin/config', label: t('nav.config'), icon: FileCode2 },
      ],
    },
    {
      title: 'System & Mesh',
      items: [
        { path: '/admin/topology', label: t('nav.topology'), icon: Network },
        { path: '/admin/diagnostics', label: t('nav.diagnostics'), icon: Gauge },
        { path: '/admin/settings', label: t('nav.settings'), icon: Wrench },
      ],
    },
  ]

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex flex-col justify-between p-3 select-none">
      <div className="space-y-6">
        {navGroups.map((group, idx) => (
          <div key={idx} className="space-y-1">
            <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all group',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold border border-primary/20 shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                      )
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Edge Core Brand Footer */}
      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-[11px] text-muted-foreground flex items-center space-x-2">
        <Radio className="w-3.5 h-3.5 text-primary shrink-0 animate-pulse" />
        <div className="truncate">
          <div className="font-medium text-foreground">CoreC Engine</div>
          <div className="text-[10px] text-muted-foreground/80">Connect · Collect · Control</div>
        </div>
      </div>
    </aside>
  )
}
