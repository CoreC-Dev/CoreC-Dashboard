/**
 * ConnectionGate — inside ConnectionProvider, waits for the connection probe
 * to finish before rendering children. Shows a loading state while connecting,
 * or an error state if the connection failed.
 *
 * Extracted verbatim from App.tsx (no behavior change) so the gate can be
 * unit-tested and extended outside the route tree.
 */
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConnection } from '@/contexts/ConnectionContext'
import i18n from '@/i18n'

// Minimal Suspense-style loading state, mirroring App.tsx's LoadingFallback.
const GateLoading: React.FC = () => (
  <div
    className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-2"
    role="status"
    aria-label={i18n.t('common.loading', { defaultValue: 'Loading…' })}
  >
    <Skeleton className="h-4 w-40" />
    <Skeleton className="h-3 w-28" />
  </div>
)

export const ConnectionGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConnecting, isConnected, error, reconnect } = useConnection()

  if (isConnecting && !isConnected) {
    return <GateLoading />
  }

  if (!isConnected && error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="text-status-error text-lg font-semibold">{error}</div>
        <Button type="button" onClick={reconnect}>
          {i18n.t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
