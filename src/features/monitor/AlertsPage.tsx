import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  Search,
  ShieldAlert,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeadLetters, useRules } from '@/api/hooks'
import { DeadLetterReplayList } from '@/components/monitor/DeadLetterReplayList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAlertStore } from '@/stores/alertStore'
import type { LogEvent } from '@/types/models'

/**
 * Alerts — live warning/error feed + dead letter queue.
 *
 * B02: the /logs subscription NO LONGER lives here. It moved to the
 * instance-level AlertStreamProvider (mounted by AppShell), which keeps
 * sounds/notifications/badge alive on every route; this page now renders
 * the shared alertStore feed, so visiting it does not open a second
 * /logs socket (subscription dedupe). The page still owns the display
 * and the sound/notification preference toggles (they write through the
 * store so the global provider honors them).
 */
export const AlertsPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: deadLettersData, refetch, isFetching, isLoading, isError, error } = useDeadLetters()
  const { data: rulesData } = useRules()

  // Shared, provider-fed feed (bounded, newest first). While this page is
  // mounted, arriving error events count as "seen" — the sidebar badge's
  // unread counter is frozen at 0 and new events don't re-arm it.
  const liveLogs = useAlertStore((s) => s.events)
  const soundEnabled = useAlertStore((s) => s.soundEnabled)
  const notifEnabled = useAlertStore((s) => s.notificationsEnabled)
  const toggleSound = useAlertStore((s) => s.toggleSound)
  const toggleNotifications = useAlertStore((s) => s.toggleNotifications)
  const setViewing = useAlertStore((s) => s.setViewing)
  useEffect(() => {
    setViewing(true)
    return () => setViewing(false)
  }, [setViewing])

  // Live feed filters
  const [logFilter, setLogFilter] = useState('')
  const [logLevel, setLogLevel] = useState<'all' | 'warning' | 'error'>('all')

  const deadLetters = useMemo(() => deadLettersData?.failed_writes || [], [deadLettersData])
  const alertRules = useMemo(
    () => (rulesData?.rules || []).filter((r) => r.action === 'alert'),
    [rulesData],
  )

  // Filter the live warning/error feed by text content and severity level.
  // The store handler already keeps only level >= 4 (warnings + errors);
  // the level filter here narrows that further to warnings-only (4–7) or
  // errors-only (8+).
  const filteredLogs = useMemo(() => {
    const term = logFilter.trim().toLowerCase()
    return liveLogs.filter((log) => {
      if (logLevel === 'warning' && log.level >= 8) return false
      if (logLevel === 'error' && log.level < 8) return false
      if (term && !log.payload.toLowerCase().includes(term)) return false
      return true
    })
  }, [liveLogs, logFilter, logLevel])

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('nav.alerts')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('alerts.realtimeWarningDesc', {
            defaultValue: 'Real-time alerts & dead letter queue',
          })}
        </p>
      </div>

      {/* Top Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 card-stagger">
        <Card className="border-border bg-card card-enter">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>{t('alerts.deadLetterQueue')}</span>
              <AlertOctagon className="w-4 h-4 text-status-error" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold font-mono text-status-error">
              {deadLetters.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{t('alerts.retriesExhausted')}</div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card card-enter">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>{t('alerts.alertRulesConfigured')}</span>
              <Bell className="w-4 h-4 text-status-warning" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold font-mono text-status-warning">
              {alertRules.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('alerts.activeAlarmTriggers')}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card card-enter">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>{t('alerts.systemErrorStream')}</span>
              <ShieldAlert className="w-4 h-4 text-primary" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold font-mono text-foreground">{liveLogs.length}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('alerts.realtimeWarningDesc', { defaultValue: 'Warnings & errors received' })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dead Letters List — selection + per-batch-confirmed replay
          (component extracted to keep this page under the 500-line lint
          ceiling; per-entry retry behavior is unchanged). */}
      <DeadLetterReplayList
        deadLetters={deadLetters}
        isLoading={isLoading}
        isError={isError}
        error={error}
        isFetching={isFetching}
        onRefresh={() => refetch()}
      />

      {/* Live Warning / Error Feed */}
      <Card className="border-border bg-card card-enter">
        <CardHeader className="p-4 flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-status-warning" />
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
            <Select
              value={logLevel}
              onValueChange={(v) => setLogLevel(v as 'all' | 'warning' | 'error')}
            >
              <SelectTrigger className="w-[10rem] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('alerts.levelAll', { defaultValue: 'All levels' })}
                </SelectItem>
                <SelectItem value="warning">
                  {t('alerts.levelWarning', { defaultValue: 'Warning' })}
                </SelectItem>
                <SelectItem value="error">
                  {t('alerts.levelError', { defaultValue: 'Error' })}
                </SelectItem>
              </SelectContent>
            </Select>
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
            <div className="space-y-2 max-h-[60vh] overflow-y-auto font-mono text-xs">
              {filteredLogs.map((log: LogEvent) => (
                <div
                  key={`${log.timestamp}-${log.level}-${log.type}-${log.payload.slice(0, 20)}`}
                  className={`p-2.5 rounded border flex items-start space-x-2 transition-colors hover:bg-muted/30 ${
                    log.level >= 8
                      ? 'border-status-error/30 bg-status-error/10 text-status-error'
                      : 'border-status-warning/30 bg-status-warning/10 text-status-warning'
                  }`}
                >
                  <span className="text-xs opacity-75 shrink-0 mt-0.5">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge variant="outline" className="text-xs py-0 h-5 uppercase shrink-0">
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
