/**
 * DiagnosticsCounterTables — the per-driver read counts and per-transport
 * publish counts scraped from /metrics (UX audit C-E3).
 *
 * These counters overlap what the driver/transport pages show from the
 * runtime APIs, so each row now links straight to that entity's detail
 * page: the diagnostics table is the cross-entity comparison surface, the
 * detail page is the drill-down. Extracted from DiagnosticsPage when the
 * page was within a few lines of the 500 gate (PprofDownloads precedent).
 */
import { ArrowRight } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { MetricEntry } from '@/lib/prometheus'
import { formatNumber } from '@/lib/utils'

/** Row link to the entity's detail page (aria-label carries the intent). */
const EntityLink: React.FC<{
  to: string
  label: string
  name: string
  className?: string
}> = ({ to, label, name, className }) => (
  <Link
    to={to}
    aria-label={label}
    className={`inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary hover:underline ${className ?? ''}`}
  >
    {name}
    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>
)

export const DiagnosticsCounterTables: React.FC<{
  driverReads: MetricEntry[]
  transportPublishes: MetricEntry[]
}> = ({ driverReads, transportPublishes }) => {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const adminBase = id ? `/corec/${id}/admin` : '/admin'

  return (
    <>
      {/* Per-Driver Read Counts */}
      <Card className="border-border bg-card overflow-hidden">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">
            {t('diagnostics.perDriverReadCounts')}
          </CardTitle>
          <CardDescription className="text-xs">
            {t('diagnostics.perDriverReadCountsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border uppercase font-semibold text-xs text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-4 py-2">{t('common.driver')}</th>
                  <th className="px-4 py-2">{t('common.type')}</th>
                  <th className="px-4 py-2 text-right">{t('drivers.reads')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {driverReads.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      {t('diagnostics.noDriverReadCounters')}
                    </td>
                  </tr>
                ) : (
                  driverReads.map((m, i) => (
                    <tr
                      key={`driver-${m.labels.driver}-${m.labels.type}-${i}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-2 font-semibold text-foreground">
                        {/* C-E3: the row drills into the driver's detail page. */}
                        <EntityLink
                          to={`${adminBase}/drivers/${encodeURIComponent(m.labels.driver ?? '')}`}
                          label={t('diagnostics.viewDriverDetail', {
                            name: m.labels.driver ?? '—',
                          })}
                          name={m.labels.driver || '—'}
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">
                        {m.labels.type || '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-primary">
                        {formatNumber(m.value)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Per-Transport Publish Counts */}
      <Card className="border-border bg-card overflow-hidden">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">
            {t('diagnostics.perTransportPublishCounts')}
          </CardTitle>
          <CardDescription className="text-xs">
            {t('diagnostics.perTransportPublishCountsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border uppercase font-semibold text-xs text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-4 py-2">{t('transports.colTransport')}</th>
                  <th className="px-4 py-2">{t('common.type')}</th>
                  <th className="px-4 py-2 text-right">{t('transports.published')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {transportPublishes.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      {t('diagnostics.noTransportPublishCounters')}
                    </td>
                  </tr>
                ) : (
                  transportPublishes.map((m, i) => (
                    <tr
                      key={`transport-${m.labels.transport}-${m.labels.type}-${i}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-2 font-semibold text-foreground">
                        <EntityLink
                          to={`${adminBase}/transports/${encodeURIComponent(m.labels.transport ?? '')}`}
                          label={t('diagnostics.viewTransportDetail', {
                            name: m.labels.transport ?? '—',
                          })}
                          name={m.labels.transport || '—'}
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">
                        {m.labels.type || '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-status-running">
                        {formatNumber(m.value)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
