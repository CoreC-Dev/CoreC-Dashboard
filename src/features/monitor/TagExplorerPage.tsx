import { AlertCircle, RefreshCw, Search, Send } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDrivers, useTags, useWriteTag } from '@/api/hooks'
import { CoreCWebSocket } from '@/api/websocket'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { QualityLabel } from '@/lib/constants'
import type { DataPoint } from '@/types/models'

export const TagExplorerPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: initialTagsData, refetch, isFetching } = useTags()
  const { data: driversData } = useDrivers()
  const writeMutation = useWriteTag()

  const [tagMap, setTagMap] = useState<Record<string, DataPoint>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDriver, setSelectedDriver] = useState<string>('all')
  const [selectedTagForWrite, setSelectedTagForWrite] = useState<DataPoint | null>(null)
  const [writeValue, setWriteValue] = useState('')
  const [writeError, setWriteError] = useState<string | null>(null)

  // Seed tag map from REST query
  useEffect(() => {
    if (initialTagsData?.tags) {
      setTagMap(initialTagsData.tags)
    }
  }, [initialTagsData])

  // Subscribe to real-time /tags/stream WebSocket
  useEffect(() => {
    const ws = new CoreCWebSocket<DataPoint>(
      '/tags/stream',
      selectedDriver !== 'all' ? { driver: selectedDriver } : {},
      (point) => {
        setTagMap((prev) => ({
          ...prev,
          [point.tag]: point,
        }))
      },
    )

    return () => ws.destroy()
  }, [selectedDriver])

  const drivers = driversData?.drivers || []
  const tagsList = Object.values(tagMap)

  const filteredTags = tagsList.filter((pt) => {
    if (selectedDriver !== 'all' && pt.driver !== selectedDriver) return false
    if (searchTerm) {
      const match =
        pt.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pt.driver.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pt.group?.toLowerCase().includes(searchTerm.toLowerCase())
      if (!match) return false
    }
    return true
  })

  const handleWriteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTagForWrite) return
    setWriteError(null)

    let parsedVal: any = writeValue
    if (selectedTagForWrite.type === 'bool') {
      parsedVal = writeValue.toLowerCase() === 'true' || writeValue === '1'
    } else if (
      selectedTagForWrite.type.startsWith('int') ||
      selectedTagForWrite.type.startsWith('uint') ||
      selectedTagForWrite.type.startsWith('float')
    ) {
      parsedVal = Number(writeValue)
    }

    try {
      await writeMutation.mutateAsync({
        driver: selectedTagForWrite.driver,
        tag: selectedTagForWrite.tag,
        device: selectedTagForWrite.device,
        value: parsedVal,
        type: selectedTagForWrite.type,
      })
      setSelectedTagForWrite(null)
      setWriteValue('')
    } catch (err: any) {
      setWriteError(err.message || 'Write failed')
    }
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-1 items-center space-x-2 w-full">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Driver Filter */}
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-transparent text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">{t('tags.allDrivers')}</option>
              {drivers.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.type})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <div className="text-xs text-muted-foreground font-mono">
              Total: {filteredTags.length} points
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-9 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tags Data Table */}
      <Card className="border-border/80 bg-card/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-b border-border/80 uppercase font-semibold text-[10px] text-muted-foreground tracking-wider">
              <tr>
                <th className="px-4 py-3">Tag Name</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Quality</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredTags.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-muted-foreground">
                    No points found matching current filter
                  </td>
                </tr>
              ) : (
                filteredTags.map((point) => {
                  const q = QualityLabel[point.quality] || QualityLabel[0]
                  return (
                    <tr
                      key={`${point.driver}:${point.tag}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">
                        {point.tag}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{point.driver}</td>
                      <td className="px-4 py-3 text-muted-foreground">{point.group || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-bold bg-muted/60 px-2 py-0.5 rounded text-foreground">
                          {typeof point.value === 'boolean'
                            ? point.value
                              ? 'TRUE'
                              : 'FALSE'
                            : String(point.value)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono text-[10px] py-0 h-4">
                          {point.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] ${q.color}`}>
                          {q.text}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                        {point.timestamp ? new Date(point.timestamp).toLocaleTimeString() : '-'}
                        {point.is_stale && (
                          <span className="ml-1.5 text-[10px] text-amber-400 border border-amber-500/30 px-1 rounded">
                            Stale
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedTagForWrite(point)
                            setWriteValue(String(point.value))
                          }}
                          className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          <span>Write</span>
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Write Command Dialog */}
      <Dialog
        open={!!selectedTagForWrite}
        onOpenChange={(open) => !open && setSelectedTagForWrite(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Send className="w-4 h-4 text-primary" />
              <span>Write to PLC Tag</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Direct Southbound control command through CoreC Command Manager
            </DialogDescription>
          </DialogHeader>

          {selectedTagForWrite && (
            <form onSubmit={handleWriteSubmit} className="space-y-4 pt-2">
              {writeError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{writeError}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs space-y-1 font-mono">
                <div>
                  <span className="text-muted-foreground">Driver: </span>
                  <span className="font-semibold text-foreground">
                    {selectedTagForWrite.driver}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tag: </span>
                  <span className="font-semibold text-primary">{selectedTagForWrite.tag}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Type: </span>
                  <span className="text-foreground">{selectedTagForWrite.type}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Target Value</label>
                <Input
                  type="text"
                  value={writeValue}
                  onChange={(e) => setWriteValue(e.target.value)}
                  placeholder="Enter value"
                  required
                  className="font-mono text-xs"
                />
              </div>

              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-500">
                {t('write.confirmWarning')}
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTagForWrite(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={writeMutation.isPending}
                  className="glow-primary"
                >
                  {writeMutation.isPending ? t('common.loading') : t('write.submit')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
