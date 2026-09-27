import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '@xterm/xterm/css/xterm.css'
import {
  Download,
  Gauge,
  Pause,
  Play,
  RefreshCw,
  Terminal as TerminalIcon,
  Trash2,
} from 'lucide-react'
import { getMetricsText } from '@/api/endpoints'
import { CoreCWebSocket } from '@/api/websocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type MetricEntry, parsePrometheusMetrics } from '@/lib/prometheus'
import { formatNumber } from '@/lib/utils'
import { useConnectionStore } from '@/stores/connectionStore'

const PPROF_PROFILES = [
  'heap',
  'goroutine',
  'profile?seconds=5',
  'trace?seconds=5',
  'block',
  'mutex',
] as const

const fmtNum = (v: number | null): string => (v === null ? 'N/A' : formatNumber(v))

const fmtSec = (v: number | null): string => {
  if (v === null) return 'N/A'
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
}> = ({ label, metric, avg, count, sum, accent }) => (
  <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
    <div className="text-[10px] text-muted-foreground uppercase font-semibold">{label}</div>
    <div className={`text-xl font-bold font-mono mt-1 ${accent}`}>{fmtSec(avg)}</div>
    <div className="text-[10px] text-muted-foreground mt-1 font-mono">
      n={fmtNum(count)} · Σ={fmtSec(sum)}
    </div>
    <div className="text-[9px] text-muted-foreground/70 mt-0.5 font-mono truncate">{metric}</div>
  </div>
)

export const DiagnosticsPage: React.FC = () => {
  const { t } = useTranslation()

  // Terminal state
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const pausedRef = useRef(false)

  // Metrics state
  const [metrics, setMetrics] = useState<MetricEntry[]>([])
  const [loadingMetrics, setLoadingMetrics] = useState(false)

  // pprof download state
  const [pprofLoading, setPprofLoading] = useState<string | null>(null)

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 12,
      theme: {
        background: '#0c0d12',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        black: '#1e293b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#38bdf8',
        white: '#f8fafc',
      },
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    xtermInstance.current = term
    fitAddonRef.current = fitAddon

    // convertEol is true, so rely on writeln's appended line break instead of
    // an explicit "\r\n" (which would render a blank line after the banner).
    term.writeln('\x1b[38;5;39m[CoreC Stream]\x1b[0m Connected to event logging bus...')

    // Log-rate limiting: buffer incoming log lines and flush to xterm via a
    // 16ms timer (≈1 frame). This coalesces log floods (error storms can
    // emit hundreds/sec) so the JS thread isn't saturated by per-message
    // writeln calls, which would freeze the UI.
    const logBuffer: string[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let droppedSinceFlush = 0
    const MAX_BATCH = 200 // cap lines per flush to bound work

    const flushBuffer = () => {
      flushTimer = null
      if (logBuffer.length === 0) return
      const toWrite = logBuffer.splice(0, MAX_BATCH)
      for (const line of toWrite) {
        term.writeln(line)
      }
      if (droppedSinceFlush > 0) {
        term.writeln(
          `\x1b[33m[CoreC Stream]\x1b[0m ${droppedSinceFlush} log lines dropped (rate limit)\x1b[0m`,
        )
        droppedSinceFlush = 0
      }
    }

    const scheduleFlush = () => {
      if (flushTimer === null) {
        flushTimer = setTimeout(flushBuffer, 16)
      }
    }

    // Subscribe to /logs WebSocket
    const ws = new CoreCWebSocket('/logs', {}, (evt: any) => {
      if (pausedRef.current) return
      const time = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''
      let color = '\x1b[37m' // default white
      let levelTag = '[INFO]'

      if (evt.level <= -4) {
        color = '\x1b[90m' // gray
        levelTag = '[DEBUG]'
      } else if (evt.level === 0) {
        color = '\x1b[36m' // cyan
        levelTag = '[INFO]'
      } else if (evt.level === 4) {
        color = '\x1b[33m' // yellow
        levelTag = '[WARN]'
      } else if (evt.level >= 8) {
        color = '\x1b[31m' // red
        levelTag = '[ERROR]'
      }

      const line = `\x1b[90m${time}\x1b[0m ${color}${levelTag}\x1b[0m \x1b[1m${evt.type || ''}\x1b[0m: ${
        evt.payload || ''
      }`

      // If buffer is already full for this frame, drop and count.
      if (logBuffer.length >= MAX_BATCH) {
        droppedSinceFlush++
      } else {
        logBuffer.push(line)
      }
      scheduleFlush()
    })

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      if (flushTimer !== null) clearTimeout(flushTimer)
      ws.destroy()
      window.removeEventListener('resize', handleResize)
      term.dispose()
    }
  }, [])

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

  const togglePause = () => {
    const next = !isPaused
    setIsPaused(next)
    pausedRef.current = next
  }

  const clearTerminal = () => {
    xtermInstance.current?.clear()
  }

  // Fetch a pprof profile with the Bearer auth header and trigger a local
  // download. Direct <a href> links would receive a 401 because pprof is
  // mounted inside CoreC's authed route group.
  const downloadPprof = async (profile: string) => {
    const { baseUrl, secret } = useConnectionStore.getState()
    const cleanBase = baseUrl.trim().replace(/\/+$/, '')
    const url = `${cleanBase}/debug/pprof/${profile}`
    setPprofLoading(profile)
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
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
      xtermInstance.current?.writeln(
        `\x1b[31m[pprof]\x1b[0m failed to fetch /debug/pprof/${profile}: ${msg}`,
      )
    } finally {
      setPprofLoading(null)
    }
  }

  // Filter key metrics
  const goroutines = metrics.find((m) => m.name === 'corec_goroutines')?.value ?? 0
  const heapAllocBytes = metrics.find((m) => m.name === 'corec_mem_heap_alloc_bytes')?.value ?? 0
  const gcCount = metrics.find((m) => m.name === 'corec_gc_count')?.value ?? 0
  const totalDropped = metrics.find((m) => m.name === 'corec_dropped_total')?.value ?? 0
  const offlinePending = metrics.find((m) => m.name === 'corec_offline_buffer_pending')?.value ?? 0

  // Additional metrics (graceful "N/A" when absent from /metrics).
  const findMetric = (name: string): number | null => {
    const m = metrics.find((mt) => mt.name === name)
    return m ? m.value : null
  }
  const histogram = (base: string) => {
    const count = findMetric(`${base}_count`)
    const sum = findMetric(`${base}_sum`)
    const avg = count !== null && sum !== null && count > 0 ? sum / count : null
    return { count, sum, avg }
  }

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
        <p className="text-xs text-muted-foreground">
          Real-time terminal log streaming, Prometheus scrape metrics & pprof debugging
        </p>
      </div>

      {/* Real-time xterm.js Terminal */}
      <Card className="border-border/80 bg-card/60 overflow-hidden">
        <CardHeader className="p-3 bg-muted/40 border-b border-border/60 flex flex-row items-center justify-between">
          <div className="flex items-center space-x-2">
            <TerminalIcon className="w-4 h-4 text-primary" />
            <CardTitle className="text-xs font-semibold">
              {t('diagnostics.terminalTitle')}
            </CardTitle>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={togglePause} className="h-7 px-2 text-xs">
              {isPaused ? (
                <>
                  <Play className="w-3 h-3 mr-1 text-emerald-400" />
                  <span>{t('diagnostics.resume')}</span>
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3 mr-1 text-amber-400" />
                  <span>{t('diagnostics.pause')}</span>
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTerminal}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              <span>{t('diagnostics.clear')}</span>
            </Button>
          </div>
        </CardHeader>
        <div ref={terminalRef} className="h-80 w-full p-2 bg-[#0c0d12]" />
      </Card>

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
        </CardHeader>

        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Goroutines
              </div>
              <div className="text-xl font-bold font-mono text-primary mt-1">{goroutines}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Heap Allocated
              </div>
              <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                {(heapAllocBytes / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                GC Cycles
              </div>
              <div className="text-xl font-bold font-mono text-cyan-400 mt-1">{gcCount}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Offline Buffer
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {offlinePending} batches
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Bus Dropped
              </div>
              <div className="text-xl font-bold font-mono text-rose-400 mt-1">{totalDropped}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Latency & Data Age Histograms */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Latency & Data Age</CardTitle>
          <CardDescription className="text-xs">
            Histogram snapshots (avg = Σ/n) and gauges parsed from /metrics
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <HistTile
              label="Read Latency"
              metric="corec_read_latency_seconds"
              avg={readLatency.avg}
              count={readLatency.count}
              sum={readLatency.sum}
              accent="text-cyan-400"
            />
            <HistTile
              label="Publish Latency"
              metric="corec_publish_latency_seconds"
              avg={publishLatency.avg}
              count={publishLatency.count}
              sum={publishLatency.sum}
              accent="text-emerald-400"
            />
            <HistTile
              label="HTTP Requests"
              metric="corec_http_request_duration_seconds"
              avg={httpReq.avg}
              count={httpReq.count}
              sum={httpReq.sum}
              accent="text-blue-400"
            />
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                Data Age
              </div>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                {fmtSec(dataAge)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                current max age
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
          <CardTitle className="text-sm font-semibold">Per-Driver Read Counts</CardTitle>
          <CardDescription className="text-xs">
            corec_driver_read_total{'{driver,type}'} counters
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border/80 uppercase font-semibold text-[10px] text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-4 py-2">Driver</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Reads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {driverReads.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      N/A — no driver read counters exposed
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
          <CardTitle className="text-sm font-semibold">Per-Transport Publish Counts</CardTitle>
          <CardDescription className="text-xs">
            corec_transport_published_total{'{transport,type}'} counters
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border/80 uppercase font-semibold text-[10px] text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-4 py-2">Transport</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Published</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {transportPublishes.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      N/A — no transport publish counters exposed
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
          <CardTitle className="text-sm font-semibold">Go pprof Profiling Endpoints</CardTitle>
          <CardDescription className="text-xs">
            Authenticated heap, goroutine, and CPU profile downloads (Bearer token attached)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
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
            Profiles are fetched with the Authorization header and downloaded locally — direct links
            would receive a 401 because pprof is mounted inside CoreC's authed route group.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
