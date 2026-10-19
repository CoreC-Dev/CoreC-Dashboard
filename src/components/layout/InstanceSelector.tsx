import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown, Server } from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
import { useConnection } from '@/contexts/ConnectionContext'
import { cn } from '@/lib/cn'
import { useInstanceStore } from '@/stores/instanceStore'

interface InstanceSelectorProps {
  /** Effective collapsed state (false on mobile — drawer shows full text). */
  eff: boolean
}

/** Live per-instance verdict for the dropdown dots (audit D-20). */
type InstanceDotStatus = 'connected' | 'error' | 'connecting' | 'unknown'

const DOT_CLASS: Record<InstanceDotStatus, string> = {
  connected: 'bg-status-running',
  error: 'bg-status-error',
  connecting: 'bg-status-warning',
  unknown: 'bg-status-idle',
}

/**
 * D-20: where an instance switch lands. The old onValueChange always jumped
 * to the section root ("monitor/dashboard" / "admin/drivers"), throwing the
 * operator back to the overview from wherever they actually were — switching
 * from the alerts page or the config center lost the page context. The
 * target keeps the current section AND page segment: switching from
 * /corec/a/monitor/alerts lands on /corec/b/monitor/alerts. Deeper segments
 * are entity-scoped (drivers/:name belongs to the OLD instance) and drop to
 * the section's list page; paths outside the instance tree default to the
 * monitor section root (the index route redirects to the dashboard).
 */
export function switchInstanceTarget(pathname: string, targetId: string): string {
  const m = /^\/corec\/[^/]+\/(monitor|admin)(?:\/([^/]+))?/.exec(pathname)
  const section = m?.[1] === 'admin' ? 'admin' : 'monitor'
  const page = m?.[2]
  return page ? `/corec/${targetId}/${section}/${page}` : `/corec/${targetId}/${section}`
}

/**
 * Instance switcher dropdown. Navigates to the selected instance while
 * preserving the current page (audit D-20 — see switchInstanceTarget).
 * Renders nothing when there is no active instance.
 *
 * The dropdown dots mirror the homepage card's live verdict (D-20): the old
 * dot went green from lastConnectedAt alone ("was ever connected"), so an
 * instance the 15s homepage probe had just reported dead still showed green
 * in the sidebar. The dot now reads the same live signals the card does —
 * probeErrors for the verdict, probing for the first-probe connecting state,
 * lastConnectedAt for a past success — so the sidebar and the homepage agree.
 */
export const InstanceSelector: React.FC<InstanceSelectorProps> = ({ eff }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { instance, isConnected, isConnecting } = useConnection()
  // Select the raw store slices (stable refs between updates) and project
  // to the fields this switcher needs via useMemo.
  //
  // The previous code wrapped a `.map(...)` selector in useShallow. That loops:
  // zustand v5's useStore has no equalityFn arg — it uses
  // React.useSyncExternalStore with Object.is — and useShallow only compares
  // array elements by reference. So every getSnapshot() returned a brand-new
  // array of brand-new objects → React saw a changed snapshot every render →
  // "Maximum update depth exceeded" (#185) on every instance-scoped route
  // (SidebarNav → InstanceSelector). Returning the stable s.instances ref from
  // the selector and projecting in useMemo breaks the loop. (TD-PERF-009: this
  // re-renders on any instances/probing/probeErrors change rather than only
  // the projected fields; on instance routes the store changes at most once
  // per probe tick, so the cost is nil.)
  const allInstances = useInstanceStore((s) => s.instances)
  const probing = useInstanceStore((s) => s.probing)
  const probeErrors = useInstanceStore((s) => s.probeErrors)
  const instances = useMemo(
    () =>
      allInstances.map((i) => ({
        id: i.id,
        name: i.name,
        // Same precedence the homepage card uses (A-07): the connecting dot
        // is reserved for the very first probe; a known verdict wins.
        status: (probing[i.id] && !i.lastConnectedAt && !probeErrors[i.id]
          ? 'connecting'
          : probeErrors[i.id]
            ? 'error'
            : i.lastConnectedAt
              ? 'connected'
              : 'unknown') as InstanceDotStatus,
      })),
    [allInstances, probing, probeErrors],
  )

  if (!instance) return null

  const statusColor = isConnecting
    ? 'bg-status-warning'
    : isConnected
      ? 'bg-status-running'
      : 'bg-status-error'

  return (
    <Select
      value={instance.id}
      onValueChange={(id) => {
        const inst = instances.find((i) => i.id === id)
        if (!inst) return
        navigate(switchInstanceTarget(location.pathname, id))
      }}
    >
      <SelectPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200',
            eff
              ? 'w-9 h-9 rounded-full'
              : 'w-full h-11 rounded-lg flex items-center px-2.5 gap-2.5',
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
              <span className="text-sm font-medium truncate text-left flex-1">{instance.name}</span>
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
                aria-hidden
                className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT_CLASS[inst.status])}
              />
              <span className="truncate">{inst.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
