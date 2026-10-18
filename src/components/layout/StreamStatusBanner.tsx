import { AlertOctagon, AlertTriangle, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { deriveBanner, deriveRateLimited, useWsStatusStore } from '@/stores/wsStatusStore'

/**
 * StreamStatusBanner — page-level connection banner for the monitor pages
 * (mounted by AppShell on /monitor routes; audit B01/D-02).
 *
 * Three states, copy verbatim from the audit:
 *  - disconnected (amber): the data on screen may be stale and a reconnect
 *    is in flight — "上次更新 {{time}}" tells the operator exactly how old.
 *  - rejected (red): the stream gave up after 10 failed attempts and will
 *    never self-heal — the banner carries the reload guidance AND a retry
 *    button that calls CoreCWebSocket.reconnect() on every rejected stream
 *    (fresh backoff ladder per the audit's "受控 reconnect" requirement).
 *  - rate-limited (amber strip): a stream is shedding frames at the
 *    >500 msg/s UI protection cap, so numbers may skip.
 *
 * The banner disappears by itself when every stream reports 'open' again.
 */
export const StreamStatusBanner: React.FC = () => {
  const { t } = useTranslation()
  const banner = useWsStatusStore((s) => deriveBanner(s.streams))
  const rateLimited = useWsStatusStore((s) => deriveRateLimited(s.streams))

  if (!banner && !rateLimited) return null

  const retryRejected = () => useWsStatusStore.getState().retryRejectedStreams()

  return (
    <div className="flex flex-col gap-2 mb-3" role="status">
      {banner && (
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm',
            banner.kind === 'rejected'
              ? 'border-status-error/40 bg-status-error/10 text-status-error'
              : 'border-status-warning/40 bg-status-warning/10 text-status-warning',
          )}
        >
          {banner.kind === 'rejected' ? (
            <AlertOctagon className="w-4 h-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" aria-hidden />
          )}
          <span className="min-w-0">
            {banner.kind === 'rejected'
              ? t('monitor.streamBannerRejected')
              : t('monitor.streamBannerDisconnected', {
                  time: new Date(banner.lastActivityAt).toLocaleTimeString(),
                })}
          </span>
          {banner.kind === 'rejected' && (
            <Button
              variant="outline"
              size="sm"
              onClick={retryRejected}
              className="h-7 px-2.5 ml-auto shrink-0 text-xs border-status-error/40 text-status-error hover:bg-status-error/10 hover:text-status-error"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden />
              <span>{t('monitor.streamRetry')}</span>
            </Button>
          )}
        </div>
      )}
      {rateLimited && (
        <div className="flex items-center gap-2.5 rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-2.5 text-sm text-status-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
          <span className="min-w-0">{t('monitor.streamRateLimited')}</span>
        </div>
      )}
    </div>
  )
}
