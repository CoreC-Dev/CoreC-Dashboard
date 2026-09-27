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
import { useConnectionStore } from '@/stores/connectionStore'

export const DiagnosticsPage: React.FC = () => {
  const { t } = useTranslation()
  const { baseUrl } = useConnectionStore()

  // Terminal state
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const pausedRef = useRef(false)

  // Metrics state
  const [metrics, setMetrics] = useState<MetricEntry[]>([])
  const [loadingMetrics, setLoadingMetrics] = useState(false)

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

    term.writeln('\x1b[38;5;39m[CoreC Stream]\x1b[0m Connected to event logging bus...\r\n')

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

      term.writeln(
        `\x1b[90m${time}\x1b[0m ${color}${levelTag}\x1b[0m \x1b[1m${evt.type || ''}\x1b[0m: ${
          evt.payload || ''
        }`,
      )
    })

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
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

  // Filter key metrics
  const goroutines = metrics.find((m) => m.name === 'corec_goroutines')?.value ?? 0
  const heapAllocBytes = metrics.find((m) => m.name === 'corec_mem_heap_alloc_bytes')?.value ?? 0
  const gcCount = metrics.find((m) => m.name === 'corec_gc_count')?.value ?? 0
  const totalDropped = metrics.find((m) => m.name === 'corec_dropped_total')?.value ?? 0
  const offlinePending = metrics.find((m) => m.name === 'corec_offline_buffer_pending')?.value ?? 0

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
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3 mr-1 text-amber-400" />
                  <span>Pause</span>
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
              <span>Clear</span>
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
              <span>Prometheus Runtime Metrics</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Live scrape from CoreC GET /metrics endpoint
            </CardDescription>
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

      {/* pprof Debugging Links */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4">
          <CardTitle className="text-sm font-semibold">Go pprof Profiling Endpoints</CardTitle>
          <CardDescription className="text-xs">
            Direct heap, goroutine, and CPU profile download URLs
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex flex-wrap gap-2 text-xs">
            {['heap', 'goroutine', 'profile?seconds=5', 'trace?seconds=5', 'block', 'mutex'].map(
              (p) => (
                <a
                  key={p}
                  href={`${baseUrl}/debug/pprof/${p}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-border/80 bg-muted/30 hover:border-primary/50 font-mono text-muted-foreground hover:text-foreground transition-colors flex items-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>/debug/pprof/{p}</span>
                </a>
              ),
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
