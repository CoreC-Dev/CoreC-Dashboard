import { AlertCircle, Download, Gauge, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getActiveConnection } from '@/api/activeConnection'
import { useMetrics } from '@/api/hooks'
import { EventLogTerminal } from '@/components/admin/EventLogTerminal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  estimateQuantile,
  extractHistograms,
  type HistogramBucket,
  parsePrometheusMetrics,
} from '@/lib/prometheus'
import { formatNumber } from '@/lib/utils'

const METRICS_AUTO_REFRESH_MS = 12_000

const PPROF_PROFILES = [
  'heap',
  'goroutine',
  'profile?seconds=5',
  'trace?seconds=5',
  'block',
  'mutex',
] as const

const fmtNum = (v: number | null, fallback: string = '—'): string =>
  v === null ? fallback : formatNumber(v)

const fmtSec = (v: number | null, fallback: string = '—'): string => {
  if (v === null) return fallback
  if (v < 1) return `${(v * 1000).toFixed(2)}ms`
  return `${v.toFixed(3)}s`
}

/**
 * Compact horizontal bar chart of a histogram's bucket distribution.
 *
 * Each row is one bucket: the `le` upper bound on the left and a bar
 * whose width is proportional to the non-cumulative observation count
 * in that bucket (cumulative[i] − cumulative[i−1]). The `+Inf` overflow
 * bucket is labelled "∞". Built from plain divs — no chart dependency.
 */
const HistogramBars: React.FC<{
  buckets: HistogramBucket[]
  barClass: string
}> = ({ buckets, barClass }) => {
  const { items, maxCount } = useMemo(() => {
    let prev = 0
    const rows = buckets.map((b) => {
      const local = Math.max(0, b.count - prev)
      prev = b.count
      return { le: b.le, count: local }
    })
    const max = Math.max(1, ...rows.map((r) => r.count))
    return { items: rows, maxCount: max }
  }, [buckets])

  if (items.length === 0) return null

  return (
    <div className="mt-2 space-y-px" aria-hidden="true">
      {items.map((item, i) => {
        const widthPct = (item.count / maxCount) * 100
        const label = Number.isFinite(item.le) ? fmtSec(item.le, '') : '∞'
        return (
          <div key={`bar-${i}`} className="flex items-center gap-1">
            <span className="w-10 text-right text-[8px] font-mono text-muted-foreground/60 shrink-0 truncate">
              {label}
            </span>
            <div className="flex-1 h-1 rounded-sm bg-muted/70 overflow-hidden">
              <div className={`h-full rounded-sm ${barClass}`} style={{ width: `${widthPct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const HistTile: React.FC<{
  label: string
  metric: string
  avg: number | null
  count: number | null
  sum: number | null
  p50: number | null
  p95: number | null
  p99: number | null
  buckets: HistogramBucket[]
  accent: string
  barClass: string
}> = ({ label, metric, avg, count, sum, p50, p95, p99, buckets, accent, barClass }) => {
  const { t } = useTranslation()
  const na = t('diagnostics.notAvailable')
  return (
    <div className="p-3 rounded-lg bg-muted/40 border border-border">
      <div className="text-xs text-muted-foreground uppercase font-semibold">{label}</div>
      <div className={`text-xl font-bold font-mono mt-1 ${accent}`}>{fmtSec(p50 ?? avg, na)}</div>
      <div className="text-xs text-muted-foreground mt-1 font-mono">
        {t('diagnostics.p50')}={fmtSec(p50, na)} · {t('diagnostics.p95')}={fmtSec(p95, na)} ·{' '}
        {t('diagnostics.p99')}={fmtSec(p99, na)}
      </div>
      <div className="text-xs text-muted-foreground mt-1 font-mono">
        avg={fmtSec(avg, na)} · n={fmtNum(count, na)} · Σ={fmtSec(sum, na)}
      </div>
      <HistogramBars buckets={buckets} barClass={barClass} />
      <div className="text-xs text-muted-foreground/70 mt-0.5 font-mono truncate">{metric}</div>
    </div>
  )
}

export const DiagnosticsPage: React.FC = () => {
  const { t } = useTranslation()

  // Auto-refresh toggle — when off, refetchInterval is disabled (false).
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Metrics via TanStack Query — replaces manual setInterval polling.
  const {
    data: metricsRaw,
    refetch,
    isFetching: loadingMetrics,
  } = useMetrics(autoRefresh ? METRICS_AUTO_REFRESH_MS : false)
  const metrics = useMemo(
    () => (metricsRaw ? parsePrometheusMetrics(metricsRaw) : []),
    [metricsRaw],
  )

  // pprof download state
  const [pprofLoading, setPprofLoading] = useState<string | null>(null)
  const [pprofError, setPprofError] = useState<string | null>(null)

  // Fetch a pprof profile with the Bearer auth header and trigger a local
  // download. Direct <a href> links would receive a 401 because pprof is
  // mounted inside CoreC's authed route group.
  const downloadPprof = async (profile: string) => {
    const conn = getActiveConnection()
    const baseUrl = conn?.baseUrl ?? ''
    const secret = conn?.secret ?? ''
    const cleanBase = baseUrl.trim().replace(/\/+$/, '')
    // Route through same-origin proxy (TD-SEC-001/002, D3).
    const url = `/corec-proxy/debug/pprof/${profile}`
    setPprofLoading(profile)
    setPprofError(null)
    try {
      // Add 30s timeout — pprof profiles can block server-side for seconds
      // but should not hang forever (TD-PERF-002).
      const ctrl = new AbortController()
      const timeoutId = setTimeout(() => ctrl.abort(), 30_000)
      const res = await fetch(url, {
        headers: {
          'X-CoreC-Target': cleanBase,
          Authorization: `Bearer ${secret}`,
        },
        signal: ctrl.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        throw new Error(
          t('diagnostics.httpError', { status: res.status, statusText: res.statusText }),
        )
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      const baseName = profile.split('?')[0].replace(/\/+$/, '')
      a.download = `pprof_${baseName.replace(/\//g, '_')}.pb.gz`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('pprof download failed', e)
      setPprofError(t('diagnostics.pprofFetchFailed', { profile, error: msg }))
    } finally {
      setPprofLoading(null)
    }
  }

  // Filter key metrics — memoize the lookup map to avoid O(n) finds per render.
  const metricsMap = useMemo(() => new Map(metrics.map((m) => [m.name, m.value])), [metrics])
  // Decode histogram buckets (_bucket{le=...}, _count, _sum) once per scrape.
  const histogramsMap = useMemo(() => extractHistograms(metrics), [metrics])
  const goroutines = metricsMap.get('corec_goroutines') ?? 0
  const heapAllocBytes = metricsMap.get('corec_mem_heap_alloc_bytes') ?? 0
  const gcCount = metricsMap.get('corec_gc_count') ?? 0
  const totalDropped = metricsMap.get('corec_dropped_total') ?? 0
  const offlinePending = metricsMap.get('corec_offline_buffer_pending') ?? 0

  // Additional metrics (graceful "N/A" when absent from /metrics).
  const findMetric = useCallback(
    (name: string): number | null => {
      const m = metricsMap.get(name)
      return m !== undefined ? m : null
    },
    [metricsMap],
  )
  const histogram = useCallback(
    (base: string) => {
      const h = histogramsMap.get(base)
      const count = h?.count ?? findMetric(`${base}_count`)
      const sum = h?.sum ?? findMetric(`${base}_sum`)
      const avg = count !== null && sum !== null && count > 0 ? sum / count : null
      const buckets = h?.buckets ?? []
      const p50 = estimateQuantile(buckets, count, 0.5)
      const p95 = estimateQuantile(buckets, count, 0.95)
      const p99 = estimateQuantile(buckets, count, 0.99)
      return { count, sum, avg, buckets, p50, p95, p99 }
    },
    [histogramsMap, findMetric],
  )

  const readLatency = histogram('corec_read_latency_seconds')
  const publishLatency = histogram('corec_publish_latency_seconds')
  const httpReq = histogram('corec_http_request_duration_seconds')
  const dataAge = findMetric('corec_data_age_seconds') ?? histogram('corec_data_age_seconds').avg
  const driverReads = useMemo(
    () => metrics.filter((m) => m.name === 'corec_driver_read_total'),
    [metrics],
  )
  const transportPublishes = useMemo(
    () => metrics.filter((m) => m.name === 'corec_transport_published_total'),
    [metrics],
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('diagnostics.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('diagnostics.subtitle')}</p>
      </div>

      {/* Real-time xterm.js Terminal */}
      <EventLogTerminal />

      {/* Prometheus Native Metrics */}
      <Card className="border-border bg-card">
        <CardHeader className="p-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center space-x-2">
              <Gauge className="w-4 h-4 text-primary" />
              <span>{t('diagnostics.runtimeMetrics')}</span>
            </CardTitle>
            <CardDescription className="text-xs">{t('diagnostics.metricsDesc')}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Switch
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label={t('diagnostics.autoRefresh', { defaultValue: 'Auto-refresh' })}
              />
              <span>{t('diagnostics.autoRefresh', { defaultValue: 'Auto-refresh' })}</span>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={loadingMetrics}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold">
                {t('diagnostics.goroutines')}
              </div>
              <div className="text-xl font-bold font-mono text-primary mt-1">{goroutines}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold">
                {t('diagnostics.heapAllocated')}
              </div>
              <div className="text-xl font-bold font-mono text-primary mt-1">
                {(heapAllocBytes / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold">
                {t('diagnostics.gcCycles')}
              </div>
              <div className="text-xl font-bold font-mono text-primary mt-1">{gcCount}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold">
                {t('diagnostics.offlineBuffer')}
              </div>
              <div className="text-xl font-bold font-mono text-status-running mt-1">
                {offlinePending} {t('diagnostics.batches')}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold">
                {t('diagnostics.busDropped')}
              </div>
              <div className="text-xl font-bold font-mono text-status-error mt-1">
                {totalDropped}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Latency & Data Age Histograms */}
      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">{t('diagnostics.latencyDataAge')}</CardTitle>
          <CardDescription className="text-xs">{t('diagnostics.histogramDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <HistTile
              label={t('diagnostics.readLatency')}
              metric="corec_read_latency_seconds"
              avg={readLatency.avg}
              count={readLatency.count}
              sum={readLatency.sum}
              p50={readLatency.p50}
              p95={readLatency.p95}
              p99={readLatency.p99}
              buckets={readLatency.buckets}
              accent="text-primary"
              barClass="bg-primary"
            />
            <HistTile
              label={t('diagnostics.publishLatency')}
              metric="corec_publish_latency_seconds"
              avg={publishLatency.avg}
              count={publishLatency.count}
              sum={publishLatency.sum}
              p50={publishLatency.p50}
              p95={publishLatency.p95}
              p99={publishLatency.p99}
              buckets={publishLatency.buckets}
              accent="text-status-running"
              barClass="bg-status-running"
            />
            <HistTile
              label={t('diagnostics.httpRequests')}
              metric="corec_http_request_duration_seconds"
              avg={httpReq.avg}
              count={httpReq.count}
              sum={httpReq.sum}
              p50={httpReq.p50}
              p95={httpReq.p95}
              p99={httpReq.p99}
              buckets={httpReq.buckets}
              accent="text-status-queued"
              barClass="bg-status-queued"
            />
            <div className="p-3 rounded-lg bg-muted/40 border border-border">
              <div className="text-xs text-muted-foreground uppercase font-semibold">
                {t('diagnostics.dataAge')}
              </div>
              <div className="text-xl font-bold font-mono text-status-warning mt-1">
                {fmtSec(dataAge, t('diagnostics.notAvailable'))}
              </div>
              <div className="text-xs text-muted-foreground mt-1 font-mono">
                {t('diagnostics.currentMaxAge')}
              </div>
              <div className="text-xs text-muted-foreground/70 mt-0.5 font-mono truncate">
                corec_data_age_seconds
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                        {m.labels.driver || '—'}
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
                        {m.labels.transport || '—'}
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

      {/* pprof Debugging Downloads */}
      <Card className="border-border bg-card">
        <CardHeader className="p-4">
          <CardTitle className="text-sm font-semibold">{t('diagnostics.pprofEndpoints')}</CardTitle>
          <CardDescription className="text-xs">{t('diagnostics.pprofDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {pprofError && (
            <div className="mb-3 p-2.5 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-start space-x-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-all">{pprofError}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            {PPROF_PROFILES.map((p) => {
              const loading = pprofLoading === p
              return (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  disabled={pprofLoading !== null}
                  onClick={() => downloadPprof(p)}
                  className="h-8 px-3 font-mono text-xs"
                >
                  {loading ? (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1.5 text-primary" />
                  )}
                  <span>/debug/pprof/{p}</span>
                </Button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">{t('diagnostics.pprofFetchNote')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
