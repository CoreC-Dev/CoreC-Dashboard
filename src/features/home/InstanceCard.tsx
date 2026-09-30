import {
  Activity,
  AlertTriangle,
  ArrowDown,
  Cpu,
  MoreVertical,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  Zap,
} from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CoreCInstance } from '@/stores/instanceStore'
import { useInstanceStore } from '@/stores/instanceStore'

export interface InstanceCardProps {
  instance: CoreCInstance
  onEdit: (instance: CoreCInstance) => void
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

/** Parse Go duration string like "25m40.650422s" or "1h30m" into a short label. */
function formatUptime(uptime?: string): string {
  if (!uptime || uptime === '0s') return ''
  // Go durations: "1h30m45.123s", "25m40.650422s", "5.5s"
  // Seconds can have a decimal fraction — only take the integer part.
  const h = uptime.match(/(\d+)h/)
  const m = uptime.match(/(\d+)m/)
  const s = uptime.match(/(\d+)(?:\.\d+)?s/)
  const hours = h ? parseInt(h[1], 10) : 0
  const mins = m ? parseInt(m[1], 10) : 0
  const secs = s ? parseInt(s[1], 10) : 0
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  if (secs > 0) return `${secs}s`
  return uptime
}

/** Map driver/transport state number to color + label. */
function stateColor(state: number): string {
  // 0=Disconnected, 1=Connecting, 2=Connected, 3=Error
  switch (state) {
    case 2:
      return 'bg-emerald-400'
    case 1:
      return 'bg-amber-400 animate-pulse'
    case 3:
      return 'bg-rose-500'
    default:
      return 'bg-zinc-400'
  }
}

export const InstanceCard: React.FC<InstanceCardProps> = ({ instance, onEdit }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deleteInstance = useInstanceStore((s) => s.deleteInstance)
  const probing = useInstanceStore((s) => s.probing[instance.id] ?? false)
  const probeError = useInstanceStore((s) => s.probeErrors[instance.id])
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const stats = instance.lastKnownInfo?.stats

  // Determine status: probing → connecting, probeError → error, lastConnectedAt → connected, else unknown
  const status: 'connected' | 'error' | 'connecting' | 'unknown' = probing
    ? 'connecting'
    : probeError
      ? 'error'
      : instance.lastConnectedAt
        ? 'connected'
        : 'unknown'

  const statusColor = {
    connected: 'bg-emerald-400',
    error: 'bg-rose-500',
    connecting: 'bg-amber-400 animate-pulse',
    unknown: 'bg-zinc-400',
  }[status]

  const accentColor = instance.color || undefined

  const handleEnter = () => navigate(`/corec/${instance.id}/monitor/dashboard`)

  // Driver stats for display
  const driverList = stats?.driver_stats ? Object.values(stats.driver_stats) : []
  const transportList = stats?.transport_stats ? Object.values(stats.transport_stats) : []
  const ruleList = stats?.rule_list ?? []

  // Classify transports as input or output based on published/received counts
  const inputTransports = transportList.filter((tr) => tr.received > 0 && tr.published === 0)
  const outputTransports = transportList.filter((tr) => tr.published > 0 && tr.received === 0)
  const bidirTransports = transportList.filter((tr) => tr.published > 0 && tr.received > 0)
  // Ambiguous (both 0) — use name heuristic
  const ambiguousTransports = transportList.filter((tr) => tr.published === 0 && tr.received === 0)
  for (const tr of ambiguousTransports) {
    if (/sub|in|from/i.test(tr.name)) {
      inputTransports.push(tr)
    } else {
      outputTransports.push(tr)
    }
  }

  // All inputs: drivers + input transports + bidirectional
  const allInputs = [
    ...driverList.map((d) => ({
      name: d.name,
      type: d.type,
      state: d.state,
      detail:
        d.error_count > 0 ? `${d.error_count} err` : d.tag_count > 0 ? `${d.tag_count} tags` : '',
      isDriver: true,
    })),
    ...inputTransports.map((tr) => ({
      name: tr.name,
      type: tr.type,
      state: tr.state,
      detail: tr.received > 0 ? `${tr.received} rx` : '',
      isDriver: false,
    })),
    ...bidirTransports.map((tr) => ({
      name: tr.name,
      type: tr.type,
      state: tr.state,
      detail: `${tr.received} rx`,
      isDriver: false,
    })),
  ]

  // All outputs: output transports + bidirectional (published side)
  const allOutputs = [
    ...outputTransports.map((tr) => ({
      name: tr.name,
      type: tr.type,
      state: tr.state,
      detail: tr.published > 0 ? `${tr.published} pub` : '',
    })),
    ...bidirTransports.map((tr) => ({
      name: tr.name,
      type: tr.type,
      state: tr.state,
      detail: `${tr.published} pub`,
    })),
  ]

  const hasTopology = allInputs.length > 0 || ruleList.length > 0 || allOutputs.length > 0

  return (
    <>
      <div
        className="group relative rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all overflow-hidden flex flex-col"
        style={accentColor ? { borderTopColor: accentColor, borderTopWidth: '3px' } : undefined}
      >
        {/* Header: status dot + name */}
        <div className="p-4 pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} />
              <h3 className="font-semibold text-sm truncate">{instance.name}</h3>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(instance)}>
                  <Pencil className="w-3.5 h-3.5 mr-2" />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setConfirmDelete(true)}
                  className="text-rose-500 focus:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-3 space-y-2 flex-1">
          {/* URL */}
          <div
            className="font-mono text-xs text-muted-foreground truncate"
            title={instance.baseUrl}
          >
            {instance.baseUrl.replace(/^https?:\/\//, '')}
          </div>

          {/* Error message */}
          {probeError && (
            <div className="text-xs text-rose-500 truncate" title={probeError}>
              {probeError}
            </div>
          )}

          {/* Version + status + uptime */}
          {instance.lastKnownInfo?.version && !probeError && (
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-muted font-mono">
                v{instance.lastKnownInfo.version}
              </span>
              {instance.lastKnownInfo.uptime && (
                <span className="text-muted-foreground">
                  {formatUptime(instance.lastKnownInfo.uptime)}
                </span>
              )}
            </div>
          )}

          {/* Key metrics grid — only when stats available */}
          {stats && !probeError && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {/* Points per second */}
              <div className="rounded-md bg-muted/50 px-2 py-1.5">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  <span>吞吐</span>
                </div>
                <div className="text-sm font-semibold font-mono">
                  {stats.points_per_sec.toFixed(1)}
                  <span className="text-[10px] text-muted-foreground ml-0.5">pts/s</span>
                </div>
              </div>
              {/* Total reads */}
              <div className="rounded-md bg-muted/50 px-2 py-1.5">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Cpu className="w-3 h-3" />
                  <span>读取</span>
                </div>
                <div className="text-sm font-semibold font-mono">
                  {stats.total_read > 999
                    ? `${(stats.total_read / 1000).toFixed(1)}k`
                    : stats.total_read}
                </div>
              </div>
            </div>
          )}

          {/* Topology flow: inputs → rules → outputs */}
          {hasTopology && !probeError && (
            <div className="rounded-md bg-muted/30 px-2 py-1.5 space-y-0.5">
              {/* Inputs (drivers + incoming transports) */}
              {allInputs.map((item) => (
                <div key={`in-${item.name}`} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateColor(item.state)}`} />
                  <span className="font-mono truncate">{item.name}</span>
                  <span className="text-muted-foreground">({item.type})</span>
                  {item.detail && (
                    <span
                      className={`ml-auto ${item.detail.includes('err') ? 'text-rose-500' : 'text-muted-foreground/60'}`}
                    >
                      {item.detail}
                    </span>
                  )}
                </div>
              ))}

              {/* Arrow down + rules */}
              {ruleList.length > 0 && (
                <>
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                  {ruleList.map((rule) => (
                    <div key={rule.name} className="text-[11px] space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Zap
                          className={`w-3 h-3 shrink-0 ${rule.disabled ? 'text-muted-foreground/40' : 'text-amber-500'}`}
                        />
                        <span
                          className={`font-mono truncate ${rule.disabled ? 'line-through text-muted-foreground/50' : ''}`}
                        >
                          {rule.name}
                        </span>
                      </div>
                      <div className="pl-4 text-muted-foreground/70 text-[10px]">
                        {rule.match} → {rule.action} → {rule.target}
                        {rule.hit_count > 0 && (
                          <span className="ml-1 text-muted-foreground/50">
                            · {rule.hit_count} hits
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Arrow down + outputs */}
              {allOutputs.length > 0 && (
                <>
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                  {allOutputs.map((item) => (
                    <div key={`out-${item.name}`} className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateColor(item.state)}`}
                      />
                      <span className="font-mono truncate">{item.name}</span>
                      <span className="text-muted-foreground">({item.type})</span>
                      {item.detail && (
                        <span className="text-muted-foreground/60 ml-auto">{item.detail}</span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Summary line: tags · errors */}
          {stats && !probeError && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-0.5">
              {stats.tag_count !== undefined && <span>{stats.tag_count} 测点</span>}
              {stats.tag_count !== undefined && <span>·</span>}
              {stats.total_errors > 0 ? (
                <span className="text-rose-500 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {stats.total_errors} 错误
                </span>
              ) : (
                <span>0 错误</span>
              )}
            </div>
          )}

          {/* Last connected */}
          {instance.lastConnectedAt && !probeError && !stats && (
            <div className="text-[11px] text-muted-foreground/70">
              {formatRelativeTime(instance.lastConnectedAt)}
            </div>
          )}

          {/* User tags */}
          {instance.tags && instance.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {instance.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer: action buttons */}
        <div className="px-4 pb-4 flex items-center gap-2">
          <Button size="sm" className="h-8 flex-1" onClick={handleEnter}>
            <Play className="w-3.5 h-3.5 mr-1.5" />
            {t('instances.enter')}
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onEdit(instance)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {status === 'error' && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-amber-500"
              onClick={handleEnter}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('instances.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('instances.deleteConfirm', { name: instance.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteInstance(instance.id)
                setConfirmDelete(false)
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
