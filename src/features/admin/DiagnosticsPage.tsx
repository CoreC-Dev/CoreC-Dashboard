import { AlertCircle, Download, Gauge, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getActiveConnection } from '@/api/activeConnection'
import { getMetricsText } from '@/api/endpoints'
import { EventLogTerminal } from '@/components/admin/EventLogTerminal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { type MetricEntry, parsePrometheusMetrics } from '@/lib/prometheus'
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

const HistTile: React.FC<{
  label: string
  metric: string
  avg: number | null
  count: number | null
  sum: number | null
  accent: string
}> = ({ label, metric, avg, count, sum, accent }) => {
  const { t } = useTranslation()
  const na = t('diagnostics.notAvailable')
  return (
    <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
      <div className="text-[10px] text-muted-foreground uppercase font-semibold">{label}</div>
      <div className={`text-xl font-bold font-mono mt-1 ${accent}`}>{fmtSec(avg, na)}</div>
      <div className="text-[10px] text-muted-foreground mt-1 font-mono">
        n={fmtNum(count, na)} · Σ={fmtSec(sum, na)}
      </div>
      <div className="text-[9px] text-muted-foreground/70 mt-0.5 font-mono truncate">{metric}</div>
    </div>
  )
}

export const DiagnosticsPage: React.FC = () => {
  const { t } = useTranslation()

  // Metrics state
  const [metrics, setMetrics] = useState<MetricEntry[]>([])
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // pprof download state
  const [pprofLoading, setPprofLoading] = useState<string | null>(null)
  const [pprofError, setPprofError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true)
    try {
      const raw = await getMetricsText()
      const parsed = parsePrometheusMetrics(raw)
      setMetrics(parsed)
    } catch (e) {
      console.error('Failed to load metrics', e)
    } finally {
      setLoadingMetrics(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  // Auto-refresh metrics on a fixed interval. Re-creates the timer whenever the
  // toggle flips so turning it off immediately stops polling.
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      fetchMetrics()
    }, METRICS_AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [autoRefresh, fetchMetrics])

  // Fetch a pprof profile with the Bearer auth header and trigger a local
  // download. Direct <a href> links would receive a 401 because pprof is
  // mounted inside CoreC's authed route group.
  const downloadPprof = async (profile: string) => {
    const conn = getActiveConnection()
    const baseUrl = conn?.baseUrl ?? ''
    const secret = conn?.secret ?? ''
    const cleanBase = baseUrl.trim().replace(/\/+$/, '')
    const url = `${cleanBase}/debug/pprof/${profile}`
    setPprofLoading(profile)
    setPprofError(null)
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
      })
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
      const count = findMetric(`${base}_count`)
      const sum = findMetric(`${base}_sum`)
      const avg = count !== null && sum !== null && count > 0 ? sum / count : null
      return { count, sum, avg }
    },
    [findMetric],
  )

  const readLatency = histogram('corec_read_latency_seconds')
  const publishLatency = histogram('corec_publish_latency_seconds')
  const httpReq = histogram('corec_http_request_duration_seconds')
  const dataAge = findMetric('corec_data_age_seconds') ?? histogram('corec_data_age_seconds').avg
  const driverReads = metrics.filter((m) => m.name === 'corec_driver_read_total')
  const transportPublishes = metrics.filter((m) => m.name === 'corec_transport_published_total')

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t('diagnostics.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('diagnostics.subtitle')}</p>
      </div>

      {/* Real-time xterm.js Terminal */}
      <EventLogTerminal />

      {/* Prometheus Native Metrics */}
      <Card className="border-border/80 bg-card/60">
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
              onClick={fetchMetrics}
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
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                {t('diagnostics.goroutines')}
              </div>
              <div className="text-xl font-bold font-mono text-primary mt-1">{goroutines}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                {t('diagnostics.heapAllocated')}
              </div>
              <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                {(heapAllocBytes / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                {t('diagnostics.gcCycles')}
              </div>
              <div className="text-xl font-bold font-mono text-cyan-400 mt-1">{gcCount}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                {t('diagnostics.offlineBuffer')}
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {offlinePending} {t('diagnostics.batches')}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                {t('diagnostics.busDropped')}
              </div>
              <div className="text-xl font-bold font-mono text-rose-400 mt-1">{totalDropped}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Latency & Data Age Histograms */}
      <Card className="border-border/80 bg-card/60">
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
              accent="text-cyan-400"
            />
            <HistTile
              label={t('diagnostics.publishLatency')}
              metric="corec_publish_latency_seconds"
              avg={publishLatency.avg}
              count={publishLatency.count}
              sum={publishLatency.sum}
              accent="text-emerald-400"
            />
            <HistTile
              label={t('diagnostics.httpRequests')}
              metric="corec_http_request_duration_seconds"
              avg={httpReq.avg}
              count={httpReq.count}
              sum={httpReq.sum}
              accent="text-blue-400"
            />
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                {t('diagnostics.dataAge')}
              </div>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                {fmtSec(dataAge, t('diagnostics.notAvailable'))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                {t('diagnostics.currentMaxAge')}
              </div>
              <div className="text-[9px] text-muted-foreground/70 mt-0.5 font-mono truncate">
                corec_data_age_seconds
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Driver Read Counts */}
      <Card className="border-border/80 bg-card/60 overflow-hidden">
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
              <thead className="bg-muted/50 border-b border-border/80 uppercase font-semibold text-[10px] text-muted-foreground tracking-wider">
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
                      <td className="px-4 py-2 text-right font-mono font-bold text-cyan-400">
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
      <Card className="border-border/80 bg-card/60 overflow-hidden">
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
              <thead className="bg-muted/50 border-b border-border/80 uppercase font-semibold text-[10px] text-muted-foreground tracking-wider">
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
                      <td className="px-4 py-2 text-right font-mono font-bold text-emerald-400">
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
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4">
          <CardTitle className="text-sm font-semibold">{t('diagnostics.pprofEndpoints')}</CardTitle>
          <CardDescription className="text-xs">{t('diagnostics.pprofDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {pprofError && (
            <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2">
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
          <p className="text-[10px] text-muted-foreground mt-3">
            {t('diagnostics.pprofFetchNote')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
