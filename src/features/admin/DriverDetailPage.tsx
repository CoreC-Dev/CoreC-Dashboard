import { AlertCircle, ArrowLeft, Cpu, Database, RefreshCw, RotateCcw } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useDriver, useDriverTags } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnStateLabel, QualityLabel } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'

// CoreC emits Go's zero time (0001-01-01T00:00:00Z) for unset timestamps.
const isZeroTime = (ts: string) => !ts || ts.startsWith('0001-01-01')

const formatTimestamp = (ts: string): string => {
  if (isZeroTime(ts)) return 'Never'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
}

const BackLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Button
    asChild
    variant="ghost"
    size="sm"
    className="h-8 -ml-2 text-xs text-muted-foreground hover:text-foreground"
  >
    <Link to={to}>
      <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
      {children}
    </Link>
  </Button>
)

const StatCard: React.FC<{
  label: string
  value: string
  icon: React.ReactNode
  accent: string
}> = ({ label, value, icon, accent }) => (
  <Card className="bg-card/60">
    <CardContent className="flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-lg font-bold leading-tight">{value}</div>
      </div>
    </CardContent>
  </Card>
)

const Param: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 space-y-1">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="break-all text-xs font-medium text-foreground">{children}</div>
  </div>
)

export const DriverDetailPage: React.FC = () => {
  const { t } = useTranslation()
  const { name } = useParams<{ name: string }>()
  const { data: driver, isLoading, error, refetch, isFetching } = useDriver(name ?? '')
  const { data: tagsData, isLoading: tagsLoading } = useDriverTags(name ?? '')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <BackLink to="/admin/drivers">
          {t('drivers.driverList', { defaultValue: 'Back to Drivers' })}
        </BackLink>
        <div className="py-16 text-center text-xs text-muted-foreground">
          {t('common.loading', { defaultValue: 'Loading driver...' })}
        </div>
      </div>
    )
  }

  if (error || !driver) {
    return (
      <div className="space-y-6">
        <BackLink to="/admin/drivers">
          {t('drivers.driverList', { defaultValue: 'Back to Drivers' })}
        </BackLink>
        <Card className="border-dashed bg-card/40">
          <CardContent className="space-y-2 p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <div className="text-sm font-semibold">{t('drivers.detailNotFound')}</div>
            <div className="text-xs text-muted-foreground">
              {name
                ? `No driver named "${name}" is registered on this CoreC instance.`
                : 'No driver name was provided in the URL.'}
            </div>
            {error instanceof Error && error.message && (
              <div className="break-all font-mono text-[11px] text-rose-400/80">
                {error.message}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const st = ConnStateLabel[driver.state] ?? ConnStateLabel[0]
  // Unknown drivers return {"tags": null} (not 404); treat null/empty as "no tags".
  const tags = tagsData?.tags ? Object.values(tagsData.tags) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink to="/admin/drivers">
          {t('drivers.driverList', { defaultValue: 'Back to Drivers' })}
        </BackLink>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 shrink-0 text-xs"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </Button>
      </div>

      {/* Header */}
      <Card className="bg-card/60">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">{driver.name}</CardTitle>
              <CardDescription className="font-mono text-[11px]">{driver.type}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
            {t(st.key)}
          </Badge>
        </CardHeader>
      </Card>

      {/* Error / Reconnect / Read stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Errors"
          value={formatNumber(driver.error_count)}
          icon={<AlertCircle className="h-5 w-5 text-rose-400" />}
          accent="border border-rose-500/20 bg-rose-500/10"
        />
        <StatCard
          label="Reconnect Failures"
          value={formatNumber(driver.reconnect_count)}
          icon={<RotateCcw className="h-5 w-5 text-amber-400" />}
          accent="border border-amber-500/20 bg-amber-500/10"
        />
        <StatCard
          label="Total Reads"
          value={formatNumber(driver.read_count)}
          icon={<Database className="h-5 w-5 text-sky-400" />}
          accent="border border-sky-500/20 bg-sky-500/10"
        />
      </div>

      {/* Connection & runtime parameters */}
      <Card className="bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-primary" />
            Connection &amp; Runtime Parameters
          </CardTitle>
          <CardDescription>
            Live southbound driver state, polled-tag counters and the most recent error.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
            <Param label="Driver Name">
              <span className="font-mono">{driver.name}</span>
            </Param>
            <Param label="Protocol Type">
              <span className="font-mono">{driver.type}</span>
            </Param>
            <Param label="Connection State">
              <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
                {t(st.key)}
              </Badge>
            </Param>
            <Param label="Last Read">
              <span className="font-mono">{formatTimestamp(driver.last_read)}</span>
            </Param>
            <Param label="Tag Count">
              <span className="font-mono">{formatNumber(driver.tag_count)}</span>
            </Param>
            <Param label="Read Count">
              <span className="font-mono">{formatNumber(driver.read_count)}</span>
            </Param>
            <Param label="Error Count">
              <span className={`font-mono ${driver.error_count > 0 ? 'text-rose-400' : ''}`}>
                {formatNumber(driver.error_count)}
              </span>
            </Param>
            <Param label="Reconnect Count">
              <span className={`font-mono ${driver.reconnect_count > 0 ? 'text-amber-400' : ''}`}>
                {formatNumber(driver.reconnect_count)}
              </span>
            </Param>
          </div>

          {driver.last_error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="mb-0.5 text-xs font-semibold">Last Error</div>
                <div className="break-all font-mono text-[11px]">{driver.last_error}</div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No recent errors recorded.</div>
          )}
        </CardContent>
      </Card>

      {/* Tag values table */}
      <Card className="bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-primary" />
            Tag Values
          </CardTitle>
          <CardDescription>
            Latest cached values polled for tags registered under this driver.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tagsLoading ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Loading tag values...
            </div>
          ) : tags.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No active tag values cached for{' '}
              <span className="font-mono text-foreground">{driver.name}</span>.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/60 text-[10px] uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Tag</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Quality</th>
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Stale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {/* Cap rendered rows at 200 to avoid DOM bloat for drivers
                      with thousands of tags. Use TagExplorer for full virtualized
                      browsing of large tag sets. */}
                  {tags.slice(0, 200).map((t) => {
                    const q = QualityLabel[t.quality] ?? QualityLabel[0]
                    return (
                      <tr key={t.tag} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-semibold">{t.tag}</td>
                        <td className="px-3 py-2 font-mono font-bold text-foreground">
                          {String(t.value)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {t.type}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`h-4 py-0 text-[9px] ${q.color}`}>
                            {t(q.key)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {t.timestamp ? formatTimestamp(t.timestamp) : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {t.is_stale ? (
                            <Badge
                              variant="outline"
                              className="h-4 py-0 text-[9px] border-amber-500/30 bg-amber-500/10 text-amber-400"
                            >
                              Stale
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-4 py-0 text-[9px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            >
                              Fresh
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {tags.length > 200 && (
                <div className="border-t border-border bg-muted/40 px-3 py-2 text-center text-[11px] text-muted-foreground">
                  Showing first 200 of {tags.length} tags. Use Tag Explorer for full virtualized
                  browsing.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
