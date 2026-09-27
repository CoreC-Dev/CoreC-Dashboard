import { Cpu, Radio, Send } from 'lucide-react'
import type React from 'react'
import { useDrivers, useServerInfo, useTransports } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

export const TopologyPage: React.FC = () => {
  const { data: serverInfo } = useServerInfo()
  const { data: driversData } = useDrivers()
  const { data: transportsData } = useTransports()

  const drivers = driversData?.drivers || []
  const transports = transportsData?.transports || []

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Chained-Core Mesh Topology</h1>
        <p className="text-xs text-muted-foreground">
          Hexagonal port & adapter topology: Southbound drivers, priority data bus, rule pipeline,
          and northbound relay sinks
        </p>
      </div>

      {/* Visual Interactive Architecture Diagram */}
      <Card className="border-border/80 bg-card/60 p-6 overflow-hidden">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Southbound Layer */}
          <div className="flex-1 w-full space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span>Southbound Field Devices ({drivers.length})</span>
            </div>

            <div className="space-y-2">
              {drivers.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed text-xs text-muted-foreground text-center">
                  No southbound drivers attached
                </div>
              ) : (
                drivers.map((d) => (
                  <div
                    key={d.name}
                    className="p-3 rounded-lg border border-border/80 bg-card/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-foreground">{d.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{d.type}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {d.tag_count} Tags
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CoreC Engine Node */}
          <div className="shrink-0 flex flex-col items-center justify-center p-6 rounded-2xl bg-primary/5 border-2 border-primary/30 shadow-xl glow-primary text-center max-w-xs w-full">
            <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center mb-3 shadow-lg">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div className="font-bold text-base text-foreground">
              {serverInfo?.name || 'corec-node-01'}
            </div>
            <div className="text-xs text-primary font-mono font-medium mt-0.5">
              Role: Collector / Gateway
            </div>
            <div className="text-[10px] text-muted-foreground mt-2 border-t border-border/60 pt-2 w-full space-y-1">
              <div>Zero-Lock DataBus (8192 buffer)</div>
              <div>Rule Pipeline (First-Match-Wins)</div>
              <div>Command Manager (16 Semaphore)</div>
            </div>
          </div>

          {/* Northbound Layer */}
          <div className="flex-1 w-full space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
              <Send className="w-3.5 h-3.5 text-indigo-400" />
              <span>Northbound Sinks ({transports.length})</span>
            </div>

            <div className="space-y-2">
              {transports.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed text-xs text-muted-foreground text-center">
                  No northbound transports attached
                </div>
              ) : (
                transports.map((t) => (
                  <div
                    key={t.name}
                    className="p-3 rounded-lg border border-border/80 bg-card/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-foreground">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{t.type}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {t.published} sent
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
