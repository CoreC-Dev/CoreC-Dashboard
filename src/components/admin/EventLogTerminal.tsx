import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '@xterm/xterm/css/xterm.css'
import { Pause, Play, Terminal as TerminalIcon, Trash2 } from 'lucide-react'
import { CoreCWebSocket } from '@/api/websocket'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import type { LogEvent } from '@/types/models'

/**
 * EventLogTerminal — reusable xterm.js terminal that subscribes to the CoreC
 * /logs WebSocket bus and renders live log events in real time.
 *
 * Extracted from DiagnosticsPage so it can be embedded in other pages
 * (e.g. ConfigCenterPage shows it above the runtime log-level patch card so
 * the operator sees the effect of switching levels immediately).
 *
 * Props:
 *  - height: CSS height for the terminal area (default h-80).
 */
export const EventLogTerminal: React.FC<{
  height?: string
}> = ({ height = 'h-80' }) => {
  const { t } = useTranslation()
  // Keep a ref to the latest `t` so the terminal init effect (which must run
  // once) can render localized strings without re-subscribing on language change.
  const tRef = useRef(t)
  tRef.current = t

  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const pausedRef = useRef(false)

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
    // Initial banner says "connecting" — the onStatus callback below updates
    // it to "connected" (or error/reconnecting) once the WebSocket settles.
    // This avoids the misleading "已连接" (connected) banner that previously
    // appeared even when the proxy silently dropped the WS upgrade.
    term.writeln(`\x1b[33m[CoreC Stream]\x1b[0m ${tRef.current('diagnostics.streamConnecting')}`)

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
          `\x1b[33m[CoreC Stream]\x1b[0m ${tRef.current('diagnostics.logLinesDropped', { count: droppedSinceFlush })}\x1b[0m`,
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
    const ws = new CoreCWebSocket(
      '/logs',
      {},
      (evt: LogEvent) => {
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
      },
      (status) => {
        // Real connection status — write to terminal so the user sees the
        // actual state instead of a stale static banner.
        switch (status) {
          case 'open':
            term.writeln(
              `\x1b[38;5;39m[CoreC Stream]\x1b[0m ${tRef.current('diagnostics.streamConnected')}`,
            )
            break
          case 'error':
            term.writeln(
              `\x1b[31m[CoreC Stream]\x1b[0m ${tRef.current('diagnostics.streamError')}\x1b[0m`,
            )
            break
          case 'closed':
            term.writeln(
              `\x1b[33m[CoreC Stream]\x1b[0m ${tRef.current('diagnostics.streamReconnecting')}\x1b[0m`,
            )
            break
          case 'rejected':
            term.writeln(
              `\x1b[31m[CoreC Stream]\x1b[0m ${tRef.current('diagnostics.streamRejected')}\x1b[0m`,
            )
            break
          default:
            break
        }
      },
    )

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      if (flushTimer !== null) clearTimeout(flushTimer)
      ws.destroy()
      window.removeEventListener('resize', handleResize)
      term.dispose()
    }
  }, [])

  const togglePause = () => {
    const next = !isPaused
    setIsPaused(next)
    pausedRef.current = next
  }

  const clearTerminal = () => {
    xtermInstance.current?.clear()
  }

  return (
    <Card className="border-border/80 bg-card/60 overflow-hidden">
      <CardHeader className="p-3 bg-muted/40 border-b border-border/60 flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2">
          <TerminalIcon className="w-4 h-4 text-primary" />
          <CardTitle className="text-xs font-semibold">{t('diagnostics.terminalTitle')}</CardTitle>
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
      <div ref={terminalRef} className={`${height} w-full p-2 bg-[#0c0d12]`} />
    </Card>
  )
}
