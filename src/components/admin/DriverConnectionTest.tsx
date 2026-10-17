/**
 * DriverConnectionTest — the optional "test connection" probe on the
 * DriverWizard's connection step (POST /drivers/test).
 *
 * The backend instantiates a THROWAWAY driver of the selected type with
 * the form's current settings, drives it through the same init→start
 * lifecycle a configured driver follows, and always tears it down — the
 * operator can therefore validate reachability BEFORE saving the config
 * (the backend's own documented usage for this endpoint).
 *
 * Contract constraints this UI honors (hub/route/driver_check.go):
 *  - purely auxiliary: it NEVER gates the step — Next stays available
 *    regardless of the outcome, and a failed probe is not an error state;
 *  - the button is disabled while a probe is in flight (and before a
 *    driver type is chosen);
 *  - once the type/settings change after a run, the previous result is
 *    hidden as stale, so a green check can never mislead about edited
 *    parameters;
 *  - a 200 {ok:false} shows the server's error text (e.g. "connection
 *    refused", "driver test timed out after 5s") plus an actionable hint.
 */
import { AlertCircle, CheckCircle2, Loader2, PlugZap, XCircle } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDriverTest } from '@/api/hooks'
import { Button } from '@/components/ui/button'

export interface DriverConnectionTestProps {
  /** Selected driver type; the probe is disabled until one is chosen. */
  type: string | null
  /** Live settings from the wizard form, sent verbatim as drivers[].settings. */
  settings: Record<string, unknown>
  /** Informational log label for the throwaway instance (defaults server-side). */
  name?: string
}

export const DriverConnectionTest: React.FC<DriverConnectionTestProps> = ({
  type,
  settings,
  name,
}) => {
  const { t } = useTranslation()
  const { mutate, isPending, data, error } = useDriverTest()

  // Stale guard: remember which inputs the last run tested. The result
  // stays visible only while the form still matches those inputs.
  const currentKey = JSON.stringify([type ?? '', settings])
  const [testedKey, setTestedKey] = useState<string | null>(null)
  const showResult = testedKey !== null && testedKey === currentKey

  const runTest = () => {
    if (!type || isPending) return
    setTestedKey(currentKey)
    mutate({ type, settings, name })
  }

  const hint = <p className="text-muted-foreground">{t('driverWizard.testFailedHint')}</p>

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <PlugZap className="h-3.5 w-3.5 text-primary shrink-0" />
            {t('driverWizard.testConnection')}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('driverWizard.testConnectionDesc')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={runTest}
          disabled={!type || isPending}
          className="h-7 px-2.5 text-xs shrink-0"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <PlugZap className="h-3 w-3 mr-1" />
          )}
          {isPending ? t('driverWizard.testRunning') : t('driverWizard.testConnection')}
        </Button>
      </div>

      {showResult && (
        <div aria-live="polite" className="space-y-1">
          {data?.outcome === 'completed' && data.data.connected && (
            <div
              className="flex items-start gap-2 rounded-md border border-status-running/30 bg-status-running/10 p-2 text-xs"
              data-testid="driver-test-result"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-status-running shrink-0 mt-0.5" />
              <span className="font-semibold text-status-running">
                {t('driverWizard.testConnected', { ms: data.data.latency_ms })}
              </span>
            </div>
          )}

          {data?.outcome === 'completed' && !data.data.connected && (
            <div
              className="space-y-1 rounded-md border border-status-warning/30 bg-status-warning/10 p-2 text-xs"
              data-testid="driver-test-result"
            >
              <div className="flex items-start gap-2">
                <XCircle className="h-3.5 w-3.5 text-status-warning shrink-0 mt-0.5" />
                <span className="font-semibold text-status-warning">
                  {t('driverWizard.testFailed')}
                </span>
              </div>
              {data.data.error && (
                <p className="font-mono break-all text-muted-foreground pl-5">{data.data.error}</p>
              )}
              <div className="pl-5">{hint}</div>
            </div>
          )}

          {data?.outcome === 'rejected' && (
            <div
              className="space-y-1 rounded-md border border-status-error/30 bg-status-error/10 p-2 text-xs"
              data-testid="driver-test-result"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-status-error shrink-0 mt-0.5" />
                <span className="font-semibold text-status-error">
                  {t('driverWizard.testRejected')}
                </span>
              </div>
              <p className="font-mono break-all text-muted-foreground pl-5">{data.error}</p>
              <div className="pl-5">{hint}</div>
            </div>
          )}

          {error && (
            <div
              className="space-y-1 rounded-md border border-status-error/30 bg-status-error/10 p-2 text-xs"
              data-testid="driver-test-result"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-status-error shrink-0 mt-0.5" />
                <span className="font-semibold text-status-error">
                  {t('driverWizard.testRequestFailed')}
                </span>
              </div>
              <p className="break-all text-muted-foreground pl-5">
                {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
