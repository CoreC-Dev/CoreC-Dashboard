import { ArrowDown, Zap } from 'lucide-react'
import { memo, useMemo } from 'react'
import { deriveTopologyView } from '@/features/home/instanceTopology'
import { ConnStateLabel } from '@/lib/constants'
import type { CoreCInstance } from '@/types/models'

type InstanceStats = NonNullable<NonNullable<CoreCInstance['lastKnownInfo']>['stats']>

/**
 * The inputs → rules → outputs flow rendered from the last known stats.
 * Own module so InstanceCard stays under the 500-line gate: pure presentation,
 * memoized on the stats snapshot so probe updates that don't change this
 * card's stats don't recompute the derived arrays. Renders nothing when
 * the stats carry no topology.
 */
export const InstanceCardTopology = memo(function InstanceCardTopology({
  stats,
}: {
  stats: InstanceStats | undefined
}) {
  const { allInputs, allOutputs, ruleList, hasTopology } = useMemo(
    () => deriveTopologyView(stats),
    [stats],
  )

  if (!hasTopology) return null

  return (
    <div className="space-y-1.5">
      {/* Inputs (drivers + incoming transports) */}
      {allInputs.length > 0 && (
        <div className="rounded-lg bg-muted/30 px-2.5 py-2 space-y-1.5">
          {allInputs.map((item) => (
            <div key={`in-${item.name}`} className="text-xs space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${ConnStateLabel[item.state]?.dotColor ?? 'bg-status-idle'}`}
                />
                <span className="font-mono break-words">{item.name}</span>
                <span className="ml-auto shrink-0 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  {item.type}
                </span>
              </div>
              {item.conn && (
                <div className="pl-4 text-muted-foreground/60 font-mono break-all text-xs">
                  {item.conn}
                </div>
              )}
              {item.detail && (
                <div
                  className={`pl-4 text-xs ${item.detail.includes('err') ? 'text-status-error' : 'text-muted-foreground/70'}`}
                >
                  {item.detail}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Arrow down */}
      {allInputs.length > 0 && ruleList.length > 0 && (
        <div className="flex justify-center">
          <ArrowDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        </div>
      )}

      {/* Rules */}
      {ruleList.length > 0 && (
        <div className="rounded-lg bg-muted/30 px-2.5 py-2 space-y-1.5">
          {ruleList.map((rule) => (
            <div key={rule.name} className="text-xs space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Zap
                  className={`w-3.5 h-3.5 shrink-0 ${rule.disabled ? 'text-muted-foreground/40' : 'text-status-warning'}`}
                />
                <span
                  className={`font-mono break-words ${rule.disabled ? 'line-through text-muted-foreground/50' : ''}`}
                >
                  {rule.name}
                </span>
              </div>
              <div className="pl-4 text-muted-foreground/70 text-xs break-all">
                {rule.match} → {rule.action} → {rule.target}
                {rule.hit_count > 0 && (
                  <span className="ml-1 text-muted-foreground/50">· {rule.hit_count} hits</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Arrow down */}
      {ruleList.length > 0 && allOutputs.length > 0 && (
        <div className="flex justify-center">
          <ArrowDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        </div>
      )}

      {/* Outputs */}
      {allOutputs.length > 0 && (
        <div className="rounded-lg bg-muted/30 px-2.5 py-2 space-y-1.5">
          {allOutputs.map((item) => (
            <div key={`out-${item.name}`} className="text-xs space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${ConnStateLabel[item.state]?.dotColor ?? 'bg-status-idle'}`}
                />
                <span className="font-mono break-words">{item.name}</span>
                <span className="ml-auto shrink-0 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  {item.type}
                </span>
              </div>
              {item.conn && (
                <div className="pl-4 text-muted-foreground/60 font-mono break-all text-xs">
                  {item.conn}
                </div>
              )}
              {item.detail && (
                <div className="pl-4 text-xs text-muted-foreground/70">{item.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
