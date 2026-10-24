/**
 * TransportTestSender — the "send test point" affordance on the
 * transport detail page (POST /transports/{name}/test).
 *
 * The backend publishes a synthetic data point through the named
 * transport's Publish path — designed for notify transports (Slack /
 * Teams / email / webhook) so connectivity can be verified from the
 * Dashboard without waiting for a real alert. Both outcomes are 200
 * {ok, message}; ok:false carries the Publish error verbatim.
 *
 * The mutation lives in api/hooks (useTransportTest); this component
 * just wires it up. No cache invalidation: a test point mutates nothing.
 */

import { AlertCircle, CheckCircle2, Loader2, SendHorizonal } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useTransportTest } from '@/api/hooks'
import { Button } from '@/components/ui/button'

export const TransportTestSender: React.FC<{ name: string }> = ({ name }) => {
  const { t } = useTranslation()
  const { mutate, isPending, data, error } = useTransportTest()

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="transport-test-sender">
      <Button
        variant="outline"
        size="sm"
        onClick={() => mutate(name)}
        disabled={isPending}
        className="h-8 text-xs"
      >
        {isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <SendHorizonal className="mr-1.5 h-3.5 w-3.5" />
        )}
        <span>{t('transports.testPoint')}</span>
      </Button>

      <div aria-live="polite" className="min-w-0">
        {data?.ok && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-status-running/30 bg-status-running/10 px-2 py-1 text-xs text-status-running">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">
              {t('transports.testPointSent', { message: data.message ?? '' })}
            </span>
          </span>
        )}
        {data && !data.ok && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-status-warning/30 bg-status-warning/10 px-2 py-1 text-xs text-status-warning dark:text-status-warning">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">
              {t('transports.testPointFailed', { message: data.message ?? '' })}
            </span>
          </span>
        )}
        {error && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-status-error/30 bg-status-error/10 px-2 py-1 text-xs text-status-error">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">
              {error instanceof Error ? error.message : String(error)}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
