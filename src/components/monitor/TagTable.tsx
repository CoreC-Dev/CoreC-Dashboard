import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, ArrowDown, ArrowUp, ChevronsUpDown, Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TagRow } from '@/components/monitor/TagRow'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { COLS, ROW_HEIGHT, tagKey } from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

interface TagTableProps {
  filteredTags: DataPoint[]
  flashTick: Record<string, number>
  onOpen: (point: DataPoint) => void
  onWrite: (point: DataPoint) => void
  sortKey: 'tag' | 'timestamp' | null
  sortDir: 'asc' | 'desc'
  onToggleSort: (key: 'tag' | 'timestamp') => void
  showLoading: boolean
  showError: boolean
  error: unknown
  isFetching: boolean
  onRetry: () => void
}

/** Virtualized tag data table with sticky sort header + loading/error states.
 *  Extracted verbatim from TagExplorerPage — same classes & i18n keys. */
export function TagTable({
  filteredTags,
  flashTick,
  onOpen,
  onWrite,
  sortKey,
  sortDir,
  onToggleSort,
  showLoading,
  showError,
  error,
  isFetching,
  onRetry,
}: TagTableProps) {
  const { t } = useTranslation()
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: filteredTags.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="text-xs font-semibold text-foreground">{t('tags.tagsLabel')}</div>
        <div className="text-xs text-muted-foreground">{t('tags.clickToOpenTrend')}</div>
      </div>
      {showLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : showError ? (
        <div className="space-y-3 py-10 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-status-error" />
          <div className="text-sm font-semibold">{t('common.error')}</div>
          {error instanceof Error && error.message && (
            <div className="mx-auto max-w-md break-all font-mono text-xs text-status-error/80">
              {error.message}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isFetching}
            className="h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <div ref={setScrollEl} className="overflow-auto max-h-[70vh]">
          <table className="w-full min-w-[860px] text-xs text-left">
            <thead className="sticky top-0 z-10 block bg-muted/80 border-b border-border uppercase font-semibold text-xs text-muted-foreground tracking-wider">
              <tr className="flex items-center">
                <th className="px-4 py-2.5 shrink-0 overflow-hidden" style={{ width: COLS.tag }}>
                  <button
                    type="button"
                    onClick={() => onToggleSort('tag')}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {t('tags.colTag')}
                    {sortKey === 'tag' ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-2.5 shrink-0 overflow-hidden" style={{ width: COLS.driver }}>
                  {t('tags.colDriver')}
                </th>
                <th className="px-4 py-2.5 shrink-0 overflow-hidden" style={{ width: COLS.group }}>
                  {t('tags.colGroup')}
                </th>
                <th className="px-4 py-2.5 shrink-0 overflow-hidden" style={{ width: COLS.value }}>
                  {t('tags.colValue')}
                </th>
                <th className="px-4 py-2.5 shrink-0 overflow-hidden" style={{ width: COLS.type }}>
                  {t('tags.colType')}
                </th>
                <th
                  className="px-4 py-2.5 shrink-0 overflow-hidden"
                  style={{ width: COLS.quality }}
                >
                  {t('tags.colQuality')}
                </th>
                <th
                  className="px-4 py-2.5 shrink-0 overflow-hidden"
                  style={{ width: COLS.timestamp }}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSort('timestamp')}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {t('tags.colTimestamp')}
                    {sortKey === 'timestamp' ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
                <th
                  className="px-4 py-2.5 shrink-0 overflow-hidden text-right"
                  style={{ width: COLS.actions }}
                >
                  {t('tags.colActions')}
                </th>
              </tr>
            </thead>
            <tbody
              className="block relative"
              style={{ height: rowVirtualizer.getTotalSize(), width: '100%' }}
            >
              {filteredTags.length === 0 ? (
                <tr className="block">
                  <td className="block py-10 text-center text-muted-foreground">
                    {t('tags.noPoints')}
                  </td>
                </tr>
              ) : (
                rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const point = filteredTags[virtualRow.index]
                  const key = tagKey(point)
                  return (
                    <TagRow
                      key={key}
                      point={point}
                      start={virtualRow.start}
                      flashTick={flashTick[key] ?? 0}
                      onOpen={onOpen}
                      onWrite={onWrite}
                    />
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
