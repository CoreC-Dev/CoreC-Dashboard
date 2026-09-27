import { RefreshCw, Send } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useTransports } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnStateLabel } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'

export const TransportsPage: React.FC = () => {
  const { t } = useTranslation()
  const { data, refetch, isFetching } = useTransports()
  const transports = data?.transports || []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Northbound Transports</h1>
          <p className="text-xs text-muted-foreground">
            Northbound streaming channels: MQTT Brokers, HTTP Push Webhooks, Chained Inbound
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 text-xs shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {transports.length === 0 ? (
          <Card className="col-span-full p-8 text-center text-xs text-muted-foreground border-dashed">
            No northbound transports configured in CoreC.
          </Card>
        ) : (
          transports.map((tr) => {
            const st = ConnStateLabel[tr.state] || ConnStateLabel[0]
            return (
              <Card
                key={tr.name}
                className="border-border/80 bg-card/60 hover:border-primary/40 transition-all"
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Send className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{tr.name}</CardTitle>
                        <CardDescription className="text-[11px] font-mono">
                          {tr.type}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${st.badgeColor}`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${st.dotColor}`} />
                      {st.text}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-lg bg-muted/40 border border-border/50 text-[11px]">
                    <div>
                      <div className="text-muted-foreground text-[10px]">Published</div>
                      <div className="font-mono font-bold text-emerald-400">
                        {formatNumber(tr.published)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Failed</div>
                      <div className="font-mono font-bold text-rose-400">{tr.failed}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Queue Size</div>
                      <div className="font-mono font-bold">{tr.queue_size}</div>
                    </div>
                  </div>

                  <div className="text-[11px] space-y-1 text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Commands Received:</span>
                      <span className="font-mono font-medium text-foreground">
                        {formatNumber(tr.received)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Dropped Commands:</span>
                      <span className="font-mono font-medium text-rose-400">
                        {tr.dropped_commands}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Last Published:</span>
                      <span className="font-mono text-foreground truncate max-w-[140px]">
                        {tr.last_publish ? new Date(tr.last_publish).toLocaleTimeString() : 'Never'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
