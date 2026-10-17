import { AlertCircle, CheckCircle2, History, RefreshCw } from 'lucide-react'
import type React from 'react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useWriteHistory } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'

/**
 * WriteHistoryTable — the write operation audit trail (GET /write/history):
 * every tag write recorded by CoreC, forward REST API writes and reverse
 * stream ("command") writes alike, newest-first (server caps at 1000).
 *
 * Failed entries expand their error text as a full-width sub-row, styled
 * like the dead-letter/AlertsPage failure rows (bg-status-error/5) so the
 * two write-diagnostics surfaces read consistently.
 *
 * Rows are capped client-side at MAX_VISIBLE_ROWS (TD-PERF-005 — bounded
 * DOM for unvirtualized lists).
 */
const MAX_VISIBLE_ROWS = 100

export const WriteHistoryTable: React.FC = () => {
  const { t } = useTranslation()
  const { data, isLoading, isError, error, isFetching, refetch } = useWriteHistory()

  const writes = data?.writes ?? []
  const visibleWrites = writes.slice(0, MAX_VISIBLE_ROWS)

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardHeader className="p-4 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center space-x-2">
            <History className="w-4 h-4 text-primary" />
            <span>{t('writeHistory.title')}</span>
          </CardTitle>
          <CardDescription className="text-xs">{t('writeHistory.desc')}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <LoadingState className="py-8" />
        ) : isError ? (
          <div className="space-y-3 py-8 text-center">
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
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              {t('common.retry')}
            </Button>
          </div>
        ) : writes.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-status-running mb-1" />
            <span>{t('writeHistory.empty')}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border uppercase font-semibold text-xs text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-4 py-2">{t('common.timestamp')}</th>
                  <th className="px-4 py-2">{t('writeHistory.source')}</th>
                  <th className="px-4 py-2">{t('common.target')}</th>
                  <th className="px-4 py-2">{t('common.value')}</th>
                  <th className="px-4 py-2">{t('writeHistory.result')}</th>
                  <th className="px-4 py-2">{t('writeHistory.remote')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {visibleWrites.map((w, i) => (
                  <Fragment key={`${w.timestamp}-${w.driver}-${w.tag}-${i}`}>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-muted-foreground">
                        {new Date(w.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        {w.source === 'api' ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-2 py-0 border-status-queued/30 bg-status-queued/10 text-status-queued"
                          >
                            {t('writeHistory.sourceApi')}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-2 py-0 border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                          >
                            {t('writeHistory.sourceCommand')}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono whitespace-nowrap">
                        <span className="font-semibold text-foreground">{w.driver}</span>
                        {w.device && <span className="text-muted-foreground">.{w.device}</span>}
                        <span className="text-foreground">.{w.tag}</span>
                      </td>
                      <td className="px-4 py-2 font-mono break-all">
                        {String(w.value)}
                        <span className="text-muted-foreground ml-1">({w.type})</span>
                      </td>
                      <td className="px-4 py-2">
                        {w.success ? (
                          <Badge variant="success" className="text-[10px] px-2 py-0">
                            {t('writeHistory.success')}
                          </Badge>
                        ) : (
                          <Badge variant="error" className="text-[10px] px-2 py-0">
                            {t('writeHistory.failed')}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-muted-foreground whitespace-nowrap">
                        {w.remote ?? '—'}
                      </td>
                    </tr>
                    {!w.success && w.error && (
                      <tr className="bg-status-error/5">
                        <td
                          colSpan={6}
                          className="px-4 py-1.5 text-xs font-mono break-all text-status-error border-b border-status-error/10"
                        >
                          {w.error}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {writes.length > MAX_VISIBLE_ROWS && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t('common.showing', { shown: MAX_VISIBLE_ROWS, total: writes.length })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
