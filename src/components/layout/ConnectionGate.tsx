/**
 * ConnectionGate — inside ConnectionProvider, waits for the connection probe
 * to finish before rendering children. Shows a loading state while
 * connecting, or a failure screen if the connection failed.
 *
 * The failure line shows the TRANSLATED probe verdict — the context
 * classifies failures into kinds (unauthorized/unreachable/timeout, and the
 * missing-instance case) and resolves the language-pack keys itself; the
 * technical detail (which endpoint/address was probed) is demoted into a
 * collapsed "technical details" fold so it stays available without being
 * the headline.
 *
 * The failure screen used to be a dead end — one red line and Retry,
 * no shell, no way back, so an operator with a bad API key was stuck unless
 * they knew to hit the browser back button. It now carries the instance
 * name, a retry, "edit this instance" (homepage edit dialog via?edit=),
 * and "back to instances".
 */
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConnection } from '@/contexts/ConnectionContext'

// Minimal Suspense-style loading state, mirroring App.tsx's LoadingFallback.
const GateLoading: React.FC = () => {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-2"
      role="status"
      aria-label={t('common.loading')}
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-28" />
    </div>
  )
}

export const ConnectionGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation()
  const { instance, isConnecting, isConnected, error, reconnect } = useConnection()

  if (isConnecting && !isConnected) {
    return <GateLoading />
  }

  if (!isConnected && error) {
    // Instance went missing (e.g. cleared from another tab): the context
    // already localizes this via connection.errInstance — render it as the
    // headline; the name-based title and the edit escape need an instance.
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 max-w-md mx-auto px-4 text-center">
        <h2 className="text-xl font-semibold text-status-error">
          {instance ? t('connection.gateTitle', { name: instance.name }) : error}
        </h2>
        {instance && (
          <>
            <p className="text-sm text-muted-foreground">{error}</p>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                {t('connection.technicalDetails')}
              </summary>
              {/* The probe that failed: authenticated GET /stats against the
                  configured address — enough to debug DNS/ports without
                  surfacing raw backend strings as UI copy. */}
              <code className="block mt-1 font-mono break-all">GET {instance.baseUrl}/stats</code>
            </details>
          </>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={reconnect}>
            {t('common.retry')}
          </Button>
          {instance && (
            <Button variant="outline" type="button" asChild>
              <Link to={`/?edit=${instance.id}`}>{t('connection.editInstance')}</Link>
            </Button>
          )}
          <Button variant="outline" type="button" asChild>
            <Link to="/">{t('connection.backToInstances')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
