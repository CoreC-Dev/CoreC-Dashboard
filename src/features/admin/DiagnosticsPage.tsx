import { Gauge, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useMetrics } from '@/api/hooks'
import { DiagnosticsCounterTables } from '@/components/admin/DiagnosticsCounterTables'
import { EventLogTerminal } from '@/components/admin/EventLogTerminal'
import { InstanceHealthBar } from '@/components/admin/InstanceHealthBar'
import { PprofDownloads } from '@/components/admin/PprofDownloads'
import { RealtimeStreamsPanel } from '@/components/admin/RealtimeStreamsPanel'
import { type AnchorSection, SectionAnchorNav } from '@/components/admin/SectionAnchorNav'
import { WriteHistoryTable } from '@/components/admin/WriteHistoryTable'
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

// In-page table of contents — one chip per section, in reading
// order. The labels mirror the section cards below.
const ANCHOR_SECTIONS: readonly AnchorSection[] = [
  { id: 'diagnostics-health', labelKey: 'diagnostics.navHealth' },
  { id: 'diagnostics-streams', labelKey: 'diagnostics.navStreams' },
  { id: 'diagnostics-terminal', labelKey: 'diagnostics.navTerminal' },
  { id: 'diagnostics-metrics', labelKey: 'diagnostics.navMetrics' },
  { id: 'diagnostics-writes', labelKey: 'diagnostics.navWrites' },
  { id: 'diagnostics-advanced', labelKey: 'diagnostics.navAdvanced' },
]

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
      <div className={`text-xl font-bold font-mono truncate mt-1 ${accent}`}>
        {fmtSec(p50 ?? avg, na)}
      </div>
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

  // Deep links like /diagnostics?section=writes land on the write
  // history (HashRouter routes eat #anchors, so the jump is a query
  // param + scrollIntoView — the same mechanism the in-page chips use).
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const target = searchParams.get('section')
    if (!target) return
    document
      .getElementById(`diagnostics-${target}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [searchParams])

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

      {/* Jump chips — the page's own table of contents, so the
           operator reaches "health" or "write history" without scrolling
           past everything else. */}
      <SectionAnchorNav sections={ANCHOR_SECTIONS} />

      {/* Instance version + liveness/readiness probes (public endpoints) */}
      <section id="diagnostics-health" className="scroll-mt-24">
        <InstanceHealthBar />
      </section>

      {/* Live /traffic + /memory push tiles (WS, 1s) — compact; the
          Prometheus card below stays the deep-dive surface. */}
      <section id="diagnostics-streams" className="scroll-mt-24">
        <RealtimeStreamsPanel />
      </section>

      {/* Real-time xterm.js Terminal */}
      <section id="diagnostics-terminal" className="scroll-mt-24">
        <EventLogTerminal />
      </section>

      {/* Prometheus metrics: runtime tiles + latency histograms + the
          per-driver/per-transport counter tables, one jump target. */}
      <section id="diagnostics-metrics" className="scroll-mt-24">
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
                <RefreshCw
                  className={`w-3.5 h-3.5 mr-1.5 ${loadingMetrics ? 'animate-spin' : ''}`}
                />
                <span>{t('common.refresh')}</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-muted/40 border border-border text-center">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  {t('diagnostics.goroutines')}
                </div>
                <div className="text-xl font-bold font-mono truncate text-primary mt-1">
                  {goroutines}
                </div>
              </div>
              <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-muted/40 border border-border text-center">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  {t('diagnostics.heapAllocated')}
                </div>
                <div className="text-xl font-bold font-mono truncate text-primary mt-1">
                  {(heapAllocBytes / (1024 * 1024)).toFixed(1)} MB
                </div>
              </div>
              <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-muted/40 border border-border text-center">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  {t('diagnostics.gcCycles')}
                </div>
                <div className="text-xl font-bold font-mono truncate text-primary mt-1">
                  {gcCount}
                </div>
              </div>
              <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-muted/40 border border-border text-center">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  {t('diagnostics.offlineBuffer')}
                </div>
                <div className="text-xl font-bold font-mono truncate text-status-running mt-1">
                  {offlinePending} {t('diagnostics.batches')}
                </div>
              </div>
              <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-muted/40 border border-border text-center">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  {t('diagnostics.busDropped')}
                </div>
                <div className="text-xl font-bold font-mono truncate text-status-error mt-1">
                  {totalDropped}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Latency & Data Age Histograms */}
        <Card className="border-border bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              {t('diagnostics.latencyDataAge')}
            </CardTitle>
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
                <div className="text-xl font-bold font-mono truncate text-status-warning mt-1">
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

        {/* Per-driver/per-transport counters — extracted; rows link to the
             entity detail pages */}
        <DiagnosticsCounterTables
          driverReads={driverReads}
          transportPublishes={transportPublishes}
        />
      </section>

      {/* Write Operation History (audit trail of every tag write) */}
      <section id="diagnostics-writes" className="scroll-mt-24">
        <WriteHistoryTable />
      </section>

      {/* Advanced debugging (pprof) — collapsed by default */}
      <PprofDownloads />
    </div>
  )
}
