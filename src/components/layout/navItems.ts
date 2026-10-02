import {
  Bell,
  Cpu,
  FileCode2,
  Gauge,
  LayoutDashboard,
  Network,
  Send,
  Sliders,
  Tag,
  TerminalSquare,
} from 'lucide-react'
import type React from 'react'

export type RailItem = {
  path: string
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
}

/** Monitor-section nav items, scoped to the active instance via `base`. */
export function buildMonitorItems(base: string): RailItem[] {
  return [
    { path: `${base}/monitor/dashboard`, labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { path: `${base}/monitor/tags`, labelKey: 'nav.tags', icon: Tag },
    { path: `${base}/monitor/alerts`, labelKey: 'nav.alerts', icon: Bell },
  ]
}

/** Admin-section nav items, scoped to the active instance via `base`. */
export function buildAdminItems(base: string): RailItem[] {
  return [
    { path: `${base}/admin/drivers`, labelKey: 'nav.drivers', icon: Cpu },
    { path: `${base}/admin/transports`, labelKey: 'nav.transports', icon: Send },
    { path: `${base}/admin/rules`, labelKey: 'nav.rules', icon: Sliders },
    { path: `${base}/admin/write`, labelKey: 'nav.write', icon: TerminalSquare },
    { path: `${base}/admin/config`, labelKey: 'nav.config', icon: FileCode2 },
    { path: `${base}/admin/topology`, labelKey: 'nav.topology', icon: Network },
    { path: `${base}/admin/diagnostics`, labelKey: 'nav.diagnostics', icon: Gauge },
  ]
}
