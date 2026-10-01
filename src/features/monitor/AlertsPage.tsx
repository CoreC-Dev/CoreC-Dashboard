import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeadLetters, useRules, useWriteTag } from '@/api/hooks'
import { CoreCWebSocket } from '@/api/websocket'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { safePersist, safeRead } from '@/lib/storage'
import type { LogEvent, WriteCommand } from '@/types/models'

const SOUND_KEY = 'corec_alert_sound'
const NOTIF_KEY = 'corec_alert_notification'

const readPref = (key: string): boolean => safeRead(key) === '1'
const writePref = (key: string, value: boolean): void => safePersist(key, value ? '1' : '0')

// Plays a short 800 Hz beep via the Web Audio API. The AudioContext is created
// lazily and stored in a ref so it can be unlocked by a user gesture (the
// sound toggle click) and reused for subsequent WebSocket-driven alerts.
function playBeep(ctxRef: { current: AudioContext | null }): void {
  try {
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctxRef.current = new Ctor()
    }
    const ctx = ctxRef.current
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 800
    gain.gain.value = 0.2
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    osc.start(now)
    osc.stop(now + 0.2)
  } catch {
    // AudioContext blocked or unavailable — fail silently
  }
}

// Shows a browser notification iff the user has granted permission.
function notify(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    new Notification(title, { body })
  } catch {
    // Notification API blocked — fail silently
  }
}

export const AlertsPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: deadLettersData, refetch, isFetching } = useDeadLetters()
  const { data: rulesData } = useRules()
  const writeMutation = useWriteTag()

  const [liveLogs, setLiveLogs] = useState<LogEvent[]>([])
  const [retryError, setRetryError] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(() => readPref(SOUND_KEY))
  const [notifEnabled, setNotifEnabled] = useState(() => readPref(NOTIF_KEY))

  // Live feed filters
  const [logFilter, setLogFilter] = useState('')
  const [logLevel, setLogLevel] = useState<'all' | 'warning' | 'error'>('all')

  // Refs mirror the latest preference/translation values so the WebSocket
  // callback (created once on mount) always reads current state without
  // needing to resubscribe on every toggle.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const soundRef = useRef(soundEnabled)
  const notifRef = useRef(notifEnabled)
  const tRef = useRef(t)
  // rAF batching buffers for the live-log WebSocket stream — avoids a
  // setLiveLogs call (and re-render) per incoming message at high frequency.
  const pendingLogsRef = useRef<LogEvent[]>([])
  const rafIdRef = useRef<number | null>(null)
  // Sync refs in an effect, not during render (StrictMode double-invokes render).
  useEffect(() => {
    soundRef.current = soundEnabled
    notifRef.current = notifEnabled
    tRef.current = t
  }, [soundEnabled, notifEnabled, t])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    writePref(SOUND_KEY, next)
    // Preview the beep on enable; this also unlocks the AudioContext under the
    // user-gesture requirement so later WS-driven beeps can play.
    if (next) playBeep(audioCtxRef)
  }

  const toggleNotifications = async () => {
    const next = !notifEnabled
    setNotifEnabled(next)
    writePref(NOTIF_KEY, next)
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch {
        // requestPermission rejected — preference stored; notifications skipped if denied
      }
    }
  }

  // Subscribe to /logs WebSocket for warn/error.
  // Incoming events are buffered and flushed once per animation frame to
  // avoid a state update (and re-render) on every single WS message.
  useEffect(() => {
    const flushLogs = () => {
      rafIdRef.current = null
      const batch = pendingLogsRef.current
      if (batch.length === 0) return
      pendingLogsRef.current = []
      setLiveLogs((prev) => {
        const merged = [...batch, ...prev]
        return merged.length > 50 ? merged.slice(0, 50) : merged
      })
    }

    const scheduleFlush = () => {
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushLogs)
      }
    }

    const ws = new CoreCWebSocket<LogEvent>('/logs', {}, (evt) => {
      // level >= 4 are warnings and errors
      if (evt.level >= 4) {
        pendingLogsRef.current.push(evt)
        scheduleFlush()
      }
      // level >= 8 are errors — fire audible + visual alerts when enabled
      if (evt.level >= 8) {
        if (soundRef.current) {
          playBeep(audioCtxRef)
        }
        if (notifRef.current) {
          notify(tRef.current('alerts.notificationTitle'), tRef.current('alerts.notificationBody'))
        }
      }
    })
    return () => {
      ws.destroy()
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  const deadLetters = useMemo(() => deadLettersData?.failed_writes || [], [deadLettersData])
  const alertRules = useMemo(
    () => (rulesData?.rules || []).filter((r) => r.action === 'alert'),
    [rulesData],
  )

  // Filter the live warning/error feed by text content and severity level.
  // The WS handler already keeps only level >= 4 (warnings + errors); the level
  // filter here narrows that further to warnings-only (4–7) or errors-only (8+).
  const filteredLogs = useMemo(() => {
    const term = logFilter.trim().toLowerCase()
    return liveLogs.filter((log) => {
      if (logLevel === 'warning' && log.level >= 8) return false
      if (logLevel === 'error' && log.level < 8) return false
      if (term && !log.payload.toLowerCase().includes(term)) return false
      return true
    })
  }, [liveLogs, logFilter, logLevel])

  const handleRetryDeadLetter = async (cmd: WriteCommand) => {
    setRetryError(null)
    try {
      await writeMutation.mutateAsync(cmd)
      await refetch()
    } catch (err: unknown) {
      setRetryError(err instanceof Error ? err.message : t('alerts.retryFailed'))
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>{t('alerts.deadLetterQueue')}</span>
              <AlertOctagon className="w-4 h-4 text-rose-500" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-rose-400">{deadLetters.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {t('alerts.retriesExhausted')}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>{t('alerts.alertRulesConfigured')}</span>
              <Bell className="w-4 h-4 text-amber-500" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-amber-400">{alertRules.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {t('alerts.activeAlarmTriggers')}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>{t('alerts.systemErrorStream')}</span>
              <ShieldAlert className="w-4 h-4 text-primary" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-foreground">{liveLogs.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {t('alerts.realtimeWarningDesc', { defaultValue: 'Warnings & errors received' })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dead Letters List */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-rose-400">
              <AlertOctagon className="w-4 h-4" />
              <span>{t('alerts.deadLetterControlQueue')}</span>
            </CardTitle>
            <CardDescription className="text-xs">{t('alerts.deadLetterDesc')}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {retryError && (
            <div className="mb-3 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{retryError}</span>
            </div>
          )}
          {deadLetters.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-1" />
              <span>
                {t('alerts.noDeadLetters', {
                  defaultValue: 'No failed dead letter commands recorded.',
                })}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {deadLetters.map((entry) => (
                <div
                  key={`${entry.command.driver}-${entry.command.tag}-${entry.failed_at}-${entry.attempts}`}
                  className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-mono font-semibold text-rose-400">
                      [{entry.command.driver}] {t('common.tag')}: {entry.command.tag} ={' '}
                      {String(entry.command.value)}
                    </div>
                    <div className="text-muted-foreground font-mono text-[11px]">{entry.error}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center space-x-2">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(entry.failed_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>{t('alerts.attemptsExhausted', { count: entry.attempts })}</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRetryDeadLetter(entry.command)}
                    disabled={writeMutation.isPending}
                    className="shrink-0 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    <span>{t('write.retry')}</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Warning / Error Feed */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>{t('alerts.realtimeWarning')}</span>
            </CardTitle>
            <CardDescription className="text-xs">{t('alerts.realtimeWarningDesc')}</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSound}
              aria-pressed={soundEnabled}
              className="h-8 text-xs"
            >
              {soundEnabled ? (
                <Bell className="w-3.5 h-3.5 mr-1" />
              ) : (
                <BellOff className="w-3.5 h-3.5 mr-1" />
              )}
              <span>{t(soundEnabled ? 'alerts.soundOn' : 'alerts.soundOff')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleNotifications}
              aria-pressed={notifEnabled}
              className="h-8 text-xs"
            >
              {notifEnabled ? (
                <BellRing className="w-3.5 h-3.5 mr-1" />
              ) : (
                <BellOff className="w-3.5 h-3.5 mr-1" />
              )}
              <span>{t(notifEnabled ? 'alerts.notificationsOn' : 'alerts.notificationsOff')}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {/* Feed filters */}
          <div className="flex flex-col sm:flex-row items-center gap-2 mb-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder={t('alerts.filterPlaceholder', {
                  defaultValue: 'Filter by content…',
                })}
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value as 'all' | 'warning' | 'error')}
              className="h-9 px-3 rounded-md border border-input bg-transparent text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
            >
              <option value="all">{t('alerts.levelAll', { defaultValue: 'All levels' })}</option>
              <option value="warning">
                {t('alerts.levelWarning', { defaultValue: 'Warning' })}
              </option>
              <option value="error">{t('alerts.levelError', { defaultValue: 'Error' })}</option>
            </select>
          </div>

          {liveLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t('alerts.noEvents', {
                defaultValue: 'No recent warning or error events emitted by CoreC core',
              })}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t('alerts.noMatchingEvents', {
                defaultValue: 'No events match the current filter',
              })}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto font-mono text-xs">
              {filteredLogs.map((log) => (
                <div
                  key={`${log.timestamp}-${log.level}-${log.type}-${log.payload.slice(0, 20)}`}
                  className={`p-2 rounded border flex items-start space-x-2 ${
                    log.level >= 8
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  }`}
                >
                  <span className="text-[10px] opacity-75 shrink-0 mt-0.5">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge variant="outline" className="text-[9px] py-0 h-4 uppercase">
                    {log.type ||
                      (log.level >= 8 ? t('alerts.logLevelError') : t('alerts.logLevelWarn'))}
                  </Badge>
                  <span className="break-all">{log.payload}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
