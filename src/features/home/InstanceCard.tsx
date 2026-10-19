import {
  Activity,
  AlertTriangle,
  ArrowDown,
  Ban,
  Cpu,
  MoreVertical,
  Pencil,
  Play,
  RefreshCw,
  Send,
  Trash2,
  Zap,
} from 'lucide-react'
import React, { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deriveTopologyView } from '@/features/home/instanceTopology'
import { probeOneInstance } from '@/features/home/useHomepageProbe'
import { ConnStateLabel } from '@/lib/constants'
import { formatRelativeTime } from '@/lib/formatters'
import { formatCompact, formatUptime } from '@/lib/utils'
import { PROBE_ERROR_I18N_KEYS, useInstanceStore } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

export interface InstanceCardProps {
  instance: CoreCInstance
  onEdit: (instance: CoreCInstance) => void
}

export const InstanceCard = memo(function InstanceCard({ instance, onEdit }: InstanceCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deleteInstance = useInstanceStore((s) => s.deleteInstance)
  const probing = useInstanceStore((s) => s.probing[instance.id] ?? false)
  const probeError = useInstanceStore((s) => s.probeErrors[instance.id])
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const stats = instance.lastKnownInfo?.stats

  // A-07: a background re-probe of an instance that already has a verdict
  // (connected, or failed) must not flash the card back to a yellow
  // "connecting" dot — every card used to blink yellow together every 15s,
  // and a dead instance alternated yellow/red forever. The connecting state
  // (yellow dot + radar ping) is reserved for the very first probe, before
  // any result exists.
  const status: 'connected' | 'error' | 'connecting' | 'unknown' =
    probing && !instance.lastConnectedAt && !probeError
      ? 'connecting'
      : probeError
        ? 'error'
        : instance.lastConnectedAt
          ? 'connected'
          : 'unknown'

  const statusColor = {
    connected: 'bg-status-running',
    error: 'bg-status-error',
    connecting: 'bg-status-warning',
    unknown: 'bg-status-idle',
  }[status]

  // A-13: the four colors carried no text, no tooltip and no aria-label —
  // indistinguishable for a color-blind operator and unlabelled for screen
  // readers. The dot itself gets a label in every state; error/unknown
  // additionally render the word next to it (a colored dot alone cannot
  // say "error" — the message below spells out the reason).
  const statusLabel = {
    connected: t('common.connected'),
    error: t('common.error'),
    connecting: t('common.connecting'),
    unknown: t('common.unknown'),
  }[status]

  const accentColor = instance.color || undefined

  const handleEnter = () => navigate(`/corec/${instance.id}/monitor/dashboard`)

  // Driver stats for display — memoized so probe updates that don't change
  // this card's stats don't recompute the topology arrays.
  const { allInputs, allOutputs, ruleList, hasTopology } = useMemo(
    () => deriveTopologyView(stats),
    [stats],
  )

  return (
    <>
      <div
        className="group relative rounded-lg border border-border bg-card hover:border-primary/40 card-hover overflow-hidden flex flex-col"
        style={accentColor ? { borderTopColor: accentColor, borderTopWidth: '3px' } : undefined}
      >
        {/* Header: status dot + name */}
        <div className="p-4 pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="relative w-2.5 h-2.5 shrink-0"
                role="img"
                title={statusLabel}
                aria-label={statusLabel}
              >
                {status === 'connecting' && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full bg-status-warning/40 radar-ping"
                  />
                )}
                <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
              </span>
              {(status === 'error' || status === 'unknown') && (
                <span
                  className={`shrink-0 text-[10px] leading-none px-1.5 py-0.5 rounded-full font-medium ${
                    status === 'error'
                      ? 'bg-status-error/10 text-status-error'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {statusLabel}
                </span>
              )}
              <h3 className="font-semibold text-sm break-words">{instance.name}</h3>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  aria-label={t('common.moreActions')}
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
                  className="text-status-error focus:text-status-error"
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
            className="font-mono text-xs text-muted-foreground break-all"
            title={instance.baseUrl}
          >
            {instance.baseUrl.replace(/^https?:\/\//, '')}
          </div>

          {/* Error message — translated from the recorded failure kind (A-01) */}
          {probeError && (
            <div
              className="text-xs text-status-error break-words"
              title={t(PROBE_ERROR_I18N_KEYS[probeError])}
            >
              {t(PROBE_ERROR_I18N_KEYS[probeError])}
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
            <div className="grid grid-cols-2 gap-2 pt-1">
              {/* Points per second */}
              <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Activity className="w-3.5 h-3.5" />
                  <span>{t('instanceCard.throughput')}</span>
                </div>
                <div className="text-sm font-semibold font-mono tnum mt-0.5">
                  {stats.points_per_sec.toFixed(1)}
                  <span className="text-xs text-muted-foreground ml-1">pts/s</span>
                </div>
              </div>
              {/* Total reads */}
              <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{t('instanceCard.reads')}</span>
                </div>
                <div className="text-sm font-semibold font-mono tnum mt-0.5">
                  {formatCompact(stats.total_read)}
                </div>
              </div>
              {/* Total publishes */}
              <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Send className="w-3.5 h-3.5" />
                  <span>{t('instanceCard.publishes')}</span>
                </div>
                <div className="text-sm font-semibold font-mono tnum mt-0.5">
                  {formatCompact(stats.total_publish)}
                </div>
              </div>
              {/* Total dropped — highlight in amber/rose when > 0 */}
              <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Ban className="w-3.5 h-3.5" />
                  <span>{t('instanceCard.dropped')}</span>
                </div>
                <div
                  className={`text-sm font-semibold font-mono tnum mt-0.5 ${
                    stats.total_dropped > 0 ? 'text-status-warning' : ''
                  }`}
                >
                  {formatCompact(stats.total_dropped)}
                </div>
              </div>
            </div>
          )}

          {/* Topology flow: inputs → rules → outputs — three separate panels */}
          {hasTopology && !probeError && (
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
                          <span className="ml-1 text-muted-foreground/50">
                            · {rule.hit_count} hits
                          </span>
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
                        <div className="pl-4 text-muted-foreground/70 text-xs">{item.detail}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Summary line: tags · errors */}
          {stats && !probeError && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              {stats.tag_count !== undefined && (
                <span>{t('instanceCard.points', { count: stats.tag_count })}</span>
              )}
              {stats.tag_count !== undefined && <span>·</span>}
              {stats.total_errors > 0 ? (
                <span className="text-status-error flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  {t('instanceCard.errors', { count: stats.total_errors })}
                </span>
              ) : (
                <span>{t('instanceCard.errors', { count: 0 })}</span>
              )}
            </div>
          )}

          {/* Last connected */}
          {instance.lastConnectedAt && !probeError && !stats && (
            <div className="text-xs text-muted-foreground/70">
              {formatRelativeTime(instance.lastConnectedAt, t)}
            </div>
          )}

          {/* User tags */}
          {instance.tags && instance.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {instance.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
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
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            aria-label={t('common.edit')}
            onClick={() => onEdit(instance)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {status === 'error' && (
            /* A-08: the refresh icon on a failed card used to NAVIGATE INTO
               the instance — the exact opposite of retrying, with no label
               to say either. It now re-probes (same immediate path as a
               save), announces itself as "retry connection", and spins
               while the re-probe is in flight (the card keeps its red
               verdict per A-07 until a new one lands). */
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-status-warning"
              onClick={() => void probeOneInstance(instance.id)}
              disabled={probing}
              aria-label={t('instances.retryConnection')}
              title={t('instances.retryConnection')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Delete confirmation — D-07: an irreversible action gets an
          AlertDialog (no accidental dismissal on outside click), a
          destructive-styled confirm button, and confirm copy that differs
          from the menu item that opened it. */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('instances.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('instances.deleteConfirm', { name: instance.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteInstance(instance.id)
                setConfirmDelete(false)
              }}
              className="bg-destructive text-destructive-foreground shadow hover:bg-destructive/90"
            >
              {t('instances.deleteConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})
