import { Activity, ShieldCheck } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useHealthzLive, useHealthzReady, useVersion } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * InstanceHealthBar — compact version + liveness/readiness strip for the
 * CONNECTED CoreC instance (per-instance route), rendered at the top of
 * the Diagnostics page.
 *
 * Semantics (mirrors CoreC hub/route/health.go):
 *  - liveness  : green "alive" on 200; red "unreachable" only when the
 *    probe itself cannot be reached (timeout / non-200).
 *  - readiness : green "ready" on 200; YELLOW "not ready" for a parsed
 *    503 body — the process is alive but a data path is down, which is
 *    a degraded state, not an outage. Red is reserved for probe failure.
 *
 * Version comes from the public GET /version (authoritative for the
 * running process) rather than the home card's cached lastKnownInfo.
 */
export const InstanceHealthBar: React.FC = () => {
  const { t } = useTranslation()
  const versionQuery = useVersion()
  const liveQuery = useHealthzLive()
  const readyQuery = useHealthzReady()

  const version = versionQuery.data?.version

  const ready = readyQuery.data
  const notReady = ready?.ready === false ? ready : null
  // Data-path connectivity summary (only meaningful in a not-ready body).
  const totalPaths = notReady
    ? notReady.components.drivers.length + notReady.components.transports.length
    : 0
  const upPaths = notReady
    ? [...notReady.components.drivers, ...notReady.components.transports].filter((c) => c.connected)
        .length
    : 0

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center space-x-2">
          <Activity className="w-4 h-4 text-primary" />
          <span>{t('diagnostics.instanceHealth')}</span>
        </CardTitle>
        <CardDescription className="text-xs">{t('diagnostics.instanceHealthDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Version tile */}
          <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-muted/40 border border-border">
            <div className="text-xs text-muted-foreground uppercase font-semibold">
              {t('diagnostics.versionLabel')}
            </div>
            <div className="text-xl font-bold font-mono truncate text-primary mt-1">
              {version ? `v${version}` : '—'}
            </div>
          </div>

          {/* Liveness tile */}
          <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-muted/40 border border-border">
            <div className="text-xs text-muted-foreground uppercase font-semibold">
              {t('diagnostics.livenessLabel')}
            </div>
            <div className="mt-1.5">
              {liveQuery.isError ? (
                <Badge variant="error">{t('diagnostics.unreachable')}</Badge>
              ) : liveQuery.isSuccess ? (
                <Badge variant="success">{t('diagnostics.liveBadge')}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>

          {/* Readiness tile */}
          <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-muted/40 border border-border">
            <div className="text-xs text-muted-foreground uppercase font-semibold">
              {t('diagnostics.readinessLabel')}
            </div>
            <div className="mt-1.5">
              {readyQuery.isError ? (
                <Badge variant="error">{t('diagnostics.unreachable')}</Badge>
              ) : notReady ? (
                <Badge variant="warning">{t('diagnostics.notReadyBadge')}</Badge>
              ) : ready?.ready ? (
                <Badge variant="success">{t('diagnostics.readyBadge')}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
            {notReady && (
              <div
                className="text-[10px] text-muted-foreground mt-1 font-mono truncate"
                title={notReady.reason}
              >
                {notReady.reason}
                {totalPaths > 0 && (
                  <span className="ml-1">
                    ({t('diagnostics.pathsUp', { up: upPaths, total: totalPaths })})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-2 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 shrink-0" />
          <span>{t('diagnostics.probeNote')}</span>
        </p>
      </CardContent>
    </Card>
  )
}
