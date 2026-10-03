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

/**
 * Instance switcher dropdown. Navigates to the matching section (monitor or
 * admin) of the selected instance, preserving the current section. Renders
 * nothing when there is no active instance.
 */
export const InstanceSelector: React.FC<InstanceSelectorProps> = ({ eff }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { instance, isConnected, isConnecting } = useConnection()
  // Select the raw instances array (a stable ref between store updates) and
  // project to the fields this switcher needs via useMemo.
  //
  // The previous code wrapped a `.map(...)` selector in useShallow. That loops:
  // zustand v5's useStore has no equalityFn arg — it uses
  // React.useSyncExternalStore with Object.is — and useShallow only compares
  // array elements by reference. So every getSnapshot() returned a brand-new
  // array of brand-new objects → React saw a changed snapshot every render →
  // "Maximum update depth exceeded" (#185) on every instance-scoped route
  // (SidebarNav → InstanceSelector). Returning the stable s.instances ref from
  // the selector and projecting in useMemo breaks the loop. (TD-PERF-009: this
  // re-renders on any instances change rather than only id/name/lastConnectedAt;
  // on instance routes the store changes at most once — the initial probe — so
  // the cost is nil.)
  const allInstances = useInstanceStore((s) => s.instances)
  const instances = useMemo(
    () => allInstances.map((i) => ({ id: i.id, name: i.name, lastConnectedAt: i.lastConnectedAt })),
    [allInstances],
  )

  if (!instance) return null

  const statusColor = isConnecting
    ? 'bg-status-warning'
    : isConnected
      ? 'bg-status-running'
      : 'bg-status-error'

  const isMonitor = location.pathname.includes('/monitor')
  const isAdmin = location.pathname.includes('/admin')

  return (
    <Select
      value={instance.id}
      onValueChange={(id) => {
        const inst = instances.find((i) => i.id === id)
        if (!inst) return
        const space = isMonitor
          ? 'monitor/dashboard'
          : isAdmin
            ? 'admin/drivers'
            : 'monitor/dashboard'
        navigate(`/corec/${id}/${space}`)
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
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  inst.lastConnectedAt ? 'bg-status-running' : 'bg-status-idle',
                )}
              />
              <span className="truncate">{inst.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
