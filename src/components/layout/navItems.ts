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
  /**
   * Optional live badge marker (audit B02): 'alerts' renders an unread-alert
   * count pill fed by the instance-level alert provider's store. Keeping
   * this a semantic key (not a value) lets navItems stay pure data — the
   * renderer (SidebarNav) resolves the data source.
   */
  badge?: 'alerts'
}

/** A labeled sub-group of rail items (audit D-21 splits the admin section). */
export type NavGroup = {
  labelKey: string
  items: RailItem[]
}

/** Monitor-section nav items, scoped to the active instance via `base`. */
export function buildMonitorItems(base: string): RailItem[] {
  return [
    { path: `${base}/monitor/dashboard`, labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { path: `${base}/monitor/tags`, labelKey: 'nav.tags', icon: Tag },
    { path: `${base}/monitor/alerts`, labelKey: 'nav.alerts', icon: Bell, badge: 'alerts' },
  ]
}

/**
 * Admin-section nav items as two labeled sub-groups (audit D-21): the flat
 * 7-item pile mixed "edit the config" with "watch it run", and in the
 * collapsed rail they were seven bare icons with nothing to anchor a visual
 * search. Configuration management (drivers/transports/rules/config) and
 * operations & diagnostics (write/topology/diagnostics) now carry their own
 * small section labels — the group copy lives in the packs so the renderer
 * stays dumb.
 */
export function buildAdminGroups(base: string): NavGroup[] {
  return [
    {
      labelKey: 'nav.adminConfig',
      items: [
        { path: `${base}/admin/drivers`, labelKey: 'nav.drivers', icon: Cpu },
        { path: `${base}/admin/transports`, labelKey: 'nav.transports', icon: Send },
        { path: `${base}/admin/rules`, labelKey: 'nav.rules', icon: Sliders },
        { path: `${base}/admin/config`, labelKey: 'nav.config', icon: FileCode2 },
      ],
    },
    {
      labelKey: 'nav.adminOps',
      items: [
        { path: `${base}/admin/write`, labelKey: 'nav.write', icon: TerminalSquare },
        { path: `${base}/admin/topology`, labelKey: 'nav.topology', icon: Network },
        { path: `${base}/admin/diagnostics`, labelKey: 'nav.diagnostics', icon: Gauge },
      ],
    },
  ]
}
