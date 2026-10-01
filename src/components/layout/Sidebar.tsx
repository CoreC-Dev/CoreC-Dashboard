import { Cpu, FileCode2, Gauge, Network, Send, Sliders, TerminalSquare } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'

export const Sidebar: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()

  const base = id ? `/corec/${id}/admin` : '/admin'

  const navGroups = [
    {
      id: 'southbound',
      title: t('nav.groupSouthbound'),
      items: [
        { path: `${base}/drivers`, label: t('nav.drivers'), icon: Cpu },
        { path: `${base}/transports`, label: t('nav.transports'), icon: Send },
        { path: `${base}/rules`, label: t('nav.rules'), icon: Sliders },
      ],
    },
    {
      id: 'control',
      title: t('nav.groupControl'),
      items: [
        { path: `${base}/write`, label: t('nav.write'), icon: TerminalSquare },
        { path: `${base}/config`, label: t('nav.config'), icon: FileCode2 },
      ],
    },
    {
      id: 'system',
      title: t('nav.groupSystem'),
      items: [
        { path: `${base}/topology`, label: t('nav.topology'), icon: Network },
        { path: `${base}/diagnostics`, label: t('nav.diagnostics'), icon: Gauge },
      ],
    },
  ]

  return (
    <aside
      aria-label={t('nav.admin')}
      className="w-56 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex flex-col justify-between p-3 select-none"
    >
      <div className="space-y-6">
        {navGroups.map((group) => (
          <div key={group.id} className="space-y-1">
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
                    onClick={onNavigate}
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
    </aside>
  )
}
