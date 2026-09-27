import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeadLetters, useRules, useWriteTag } from '@/api/hooks'
import { CoreCWebSocket } from '@/api/websocket'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { LogEvent } from '@/types/models'

export const AlertsPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: deadLettersData, refetch, isFetching } = useDeadLetters()
  const { data: rulesData } = useRules()
  const writeMutation = useWriteTag()

  const [liveLogs, setLiveLogs] = useState<LogEvent[]>([])

  // Subscribe to /logs WebSocket for warn/error
  useEffect(() => {
    const ws = new CoreCWebSocket<LogEvent>('/logs', {}, (evt) => {
      // level >= 4 are warnings and errors
      if (evt.level >= 4) {
        setLiveLogs((prev) => [evt, ...prev.slice(0, 49)])
      }
    })
    return () => ws.destroy()
  }, [])

  const deadLetters = deadLettersData?.failed_writes || []
  const alertRules = (rulesData?.rules || []).filter((r) => r.action === 'alert')

  const handleRetryDeadLetter = async (cmd: any) => {
    await writeMutation.mutateAsync(cmd)
    refetch()
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Dead Letter Queue</span>
              <AlertOctagon className="w-4 h-4 text-rose-500" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-rose-400">{deadLetters.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Retries exhausted writes</div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Alert Rules Configured</span>
              <Bell className="w-4 h-4 text-amber-500" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-amber-400">{alertRules.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Active alarm triggers</div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>System Error Stream</span>
              <ShieldAlert className="w-4 h-4 text-primary" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-foreground">{liveLogs.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Warnings & errors received</div>
          </CardContent>
        </Card>
      </div>

      {/* Dead Letters List */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center space-x-2 text-rose-400">
              <AlertOctagon className="w-4 h-4" />
              <span>Dead Letter Control Queue</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Commands that failed after maximum retry attempts (write-retry-count: 3)
            </CardDescription>
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
          {deadLetters.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-1" />
              <span>No failed dead letter commands recorded.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {deadLetters.map((entry, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-mono font-semibold text-rose-400">
                      [{entry.command.driver}] tag: {entry.command.tag} ={' '}
                      {String(entry.command.value)}
                    </div>
                    <div className="text-muted-foreground font-mono text-[11px]">{entry.error}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center space-x-2">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(entry.failed_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>{entry.attempts} attempts exhausted</span>
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
        <CardHeader className="p-4">
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Real-time Warning & Error Events</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Pushed live over WebSocket /logs filter (level &ge; 4)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {liveLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No recent warning or error events emitted by CoreC core
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto font-mono text-xs">
              {liveLogs.map((log, idx) => (
                <div
                  key={idx}
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
                    {log.type || (log.level >= 8 ? 'ERROR' : 'WARN')}
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
