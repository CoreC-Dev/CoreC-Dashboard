import { AlertCircle, Cpu, ExternalLink, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDrivers, useDriverTags } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConnStateLabel, QualityLabel } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import type { DriverStatus } from '@/types/models'

export const DriversPage: React.FC = () => {
  const { t } = useTranslation()
  const { data, refetch, isFetching } = useDrivers()
  const [selectedDriver, setSelectedDriver] = useState<DriverStatus | null>(null)

  const drivers = data?.drivers || []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Southbound Drivers</h1>
          <p className="text-xs text-muted-foreground">
            Industrial Southbound protocol clients: Modbus TCP/RTU/TLS, Siemens S7, OPC UA
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

      {/* Driver Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {drivers.length === 0 ? (
          <Card className="col-span-full p-8 text-center text-xs text-muted-foreground border-dashed">
            No drivers currently configured in CoreC. Add drivers in the YAML configuration.
          </Card>
        ) : (
          drivers.map((drv) => {
            const st = ConnStateLabel[drv.state] || ConnStateLabel[0]
            return (
              <Card
                key={drv.name}
                className="border-border/80 bg-card/60 hover:border-primary/40 transition-all cursor-pointer group"
                onClick={() => setSelectedDriver(drv)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{drv.name}</CardTitle>
                        <CardDescription className="text-[11px] font-mono">
                          {drv.type}
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
                      <div className="text-muted-foreground text-[10px]">Tags</div>
                      <div className="font-mono font-bold">{drv.tag_count}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Reads</div>
                      <div className="font-mono font-bold text-emerald-400">
                        {formatNumber(drv.read_count)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Errors</div>
                      <div className="font-mono font-bold text-rose-400">{drv.error_count}</div>
                    </div>
                  </div>

                  <div className="text-[11px] space-y-1 text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Reconnect Failures:</span>
                      <span className="font-mono font-medium text-foreground">
                        {drv.reconnect_count}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Last Read:</span>
                      <span className="font-mono text-foreground truncate max-w-[140px]">
                        {drv.last_read ? new Date(drv.last_read).toLocaleTimeString() : 'Never'}
                      </span>
                    </div>
                  </div>

                  {drv.last_error && (
                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] truncate flex items-center space-x-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{drv.last_error}</span>
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-end text-[11px] text-primary group-hover:underline">
                    <span>View tags & registers</span>
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Driver Detail Drawer / Dialog */}
      {selectedDriver && (
        <DriverDetailDialog driver={selectedDriver} onClose={() => setSelectedDriver(null)} />
      )}
    </div>
  )
}

const DriverDetailDialog: React.FC<{
  driver: DriverStatus
  onClose: () => void
}> = ({ driver, onClose }) => {
  const { data: tagsData, isLoading } = useDriverTags(driver.name)
  const tags = tagsData?.tags ? Object.values(tagsData.tags) : []

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="text-base font-bold flex items-center space-x-2">
                <span>{driver.name}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {driver.type}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Southbound registered tags and polled register values
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pt-2">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Loading driver tags...
            </div>
          ) : tags.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No active polled tags registered under {driver.name}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/60 border-b border-border text-[10px] uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Tag</th>
                    <th className="px-3 py-2">Group</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Quality</th>
                    <th className="px-3 py-2">Last Polled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {tags.map((t) => {
                    const q = QualityLabel[t.quality] || QualityLabel[0]
                    return (
                      <tr key={t.tag} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-semibold">{t.tag}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t.group || '-'}</td>
                        <td className="px-3 py-2 font-mono font-bold text-foreground">
                          {String(t.value)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]">{t.type}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-[9px] py-0 h-4 ${q.color}`}>
                            {q.text}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-[10px]">
                          {t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
