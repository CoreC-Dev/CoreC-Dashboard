// Config-zone driver card: a configured-but-not-necessarily-connected
// driver entry (from the saved config) — type badge, tags-file link,
// edit/delete actions. Extracted from DriversPage's config section
// (D2, quality audit 2026-10-21); behavior identical, callbacks injected.
import { Cpu, Pencil, Trash2 } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { ConnectionSummary } from '@/components/admin/DetailPageParts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DriverConfig } from '@/types/config'

export interface ConfigDriverCardProps {
  drv: DriverConfig
  onEdit: (name: string) => void
  onDelete: (name: string) => void
  /** Pre-rendered connection summaries per driver name (page-level memo). */
  summaryOf: (name: string) => string
  /** Whether this config entry also has a live runtime (connected) card. */
  isRunning: (name: string) => boolean
  /** Scroll to the runtime card (jump-to-live affordance). */
  onJumpToRuntime: (id: string) => void
  /** Whether this driver's config has unsaved working-config changes. */
  hasPendingChanges: (name: string) => boolean
}

export const ConfigDriverCard: React.FC<ConfigDriverCardProps> = ({
  drv,
  onEdit,
  onDelete,
  summaryOf,
  isRunning,
  onJumpToRuntime,
  hasPendingChanges,
}) => {
  const { t } = useTranslation()
  return (
    <Card
      key={drv.name}
      id={`cfg-driver-${drv.name}`}
      className="border-border bg-card card-enter scroll-mt-24"
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{drv.name}</CardTitle>
              <CardDescription className="text-xs font-mono">{drv.type}</CardDescription>
              <ConnectionSummary summary={summaryOf(drv.name)} />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {isRunning(drv.name) ? (
                  <button
                    type="button"
                    onClick={() => onJumpToRuntime(`runtime-driver-${drv.name}`)}
                    title={t('drivers.jumpToRuntime')}
                    aria-label={`${t('drivers.jumpToRuntime')} — ${drv.name}`}
                    className="inline-flex items-center gap-1 rounded-full border border-status-running/30 bg-status-running/10 px-2 py-0.5 text-xs text-status-running hover:bg-status-running/20 transition-colors"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-status-running" />
                    {t('drivers.zoneLive')}
                  </button>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                    {t('drivers.zoneConfigOnly')}
                  </span>
                )}
                {hasPendingChanges(drv.name) && (
                  <span className="inline-flex items-center rounded-full border border-status-warning/30 bg-status-warning/10 px-2 py-0.5 text-xs text-status-warning dark:text-status-warning">
                    {t('drivers.zonePendingChanges')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(drv.name)}
              className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
              title={t('common.edit')}
              aria-label={t('common.edit')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(drv.name)}
              className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title={t('common.delete')}
              aria-label={t('common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
            <span className="text-muted-foreground">{t('drivers.tags')}</span>
            <span className="font-mono font-bold">{drv.tags?.length ?? 0}</span>
          </div>
          {drv['tags-file'] && (
            <div className="flex items-center justify-between p-1.5 rounded bg-muted/30">
              <span className="text-muted-foreground">{t('driverWizard.tagsFile')}</span>
              <span className="font-mono truncate max-w-[100px]">{drv['tags-file']}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
