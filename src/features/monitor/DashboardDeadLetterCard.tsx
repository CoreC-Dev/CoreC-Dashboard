import { AlertOctagon, ArrowUpRight } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAlertStore } from '@/stores/alertStore'
import type { DeadLetterEntry } from '@/types/models'

interface DashboardDeadLetterCardProps {
  /** Latest failed writes (same queue the alerts page replays). */
  deadLetters: DeadLetterEntry[]
  /** Alerts page route, instance-scoped by the caller. */
  alertsLink: string
}

/**
 * Dashboard row 5 — the dead-letter card.
 *
 * Honesty requirements for this card:
 * - the title says what the card shows (failed writes),
 * - the empty state is neutral ("暂无写入失败记录") — an empty DLQ alone
 *   must not declare the system healthy while real error events exist,
 * - the header surfaces the CURRENT error-level event count from the global
 *   alert feed (alertStore.events, fed by the AppShell-level /logs
 *   provider) as a red lure toward the real alerts page.
 */
export const DashboardDeadLetterCard: React.FC<DashboardDeadLetterCardProps> = ({
  deadLetters,
  alertsLink,
}) => {
  const { t } = useTranslation()
  // Error-level (level ≥ 8) events currently held by the shared live feed
  // — the same store the sidebar unread badge draws from.
  const errorEventCount = useAlertStore((s) => s.events.filter((e) => e.level >= 8).length)

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <span>{t('dashboard.deadLetterCard')}</span>
          {errorEventCount > 0 && (
            <Link
              to={alertsLink}
              className="flex items-center gap-1 rounded-full border border-status-error/30 bg-status-error/10 px-2 py-0.5 font-mono text-xs font-normal text-status-error hover:bg-status-error/20 transition-colors"
            >
              <AlertOctagon className="h-3 w-3 shrink-0" aria-hidden />
              <span>{t('dashboard.errorEvents', { count: errorEventCount })}</span>
            </Link>
          )}
        </CardTitle>
        {/* The row-5 header link says what it does — "View All" dead
         * letters/failed writes on the alerts page — instead of borrowing
         * dashboard.manage ("Manage"), which reads as a third config
         * "Manage" link and misleads about the destination. */}
        <Link
          to={alertsLink}
          className="text-xs text-primary hover:underline flex items-center space-x-0.5"
        >
          <span>{t('dashboard.viewAll')}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {deadLetters.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('dashboard.noFailedWrites')}
          </div>
        ) : (
          <div className="space-y-2">
            {deadLetters.slice(0, 8).map((item) => (
              <div
                key={`${item.command.driver}-${item.command.tag}-${item.failed_at}-${item.attempts}`}
                className="p-3 rounded-lg border border-status-error/20 bg-status-error/5 flex items-center justify-between text-sm"
              >
                <div className="space-y-1 min-w-0">
                  <div className="font-mono font-semibold text-status-error truncate">
                    [{item.command.driver}] {item.command.tag} = {String(item.command.value)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{item.error}</div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <Badge
                    variant="outline"
                    className="border-status-error/30 text-status-error text-xs"
                  >
                    {t('dashboard.retries', { count: item.attempts })}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(item.failed_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
