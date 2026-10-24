/**
 * SeedBlockedBanner — the companion for the entity list pages.
 *
 * When the auto-seed of GET /configs/raw has not succeeded (in flight or
 * failed) and there is no saved baseline, configStore refuses the
 * destructive paths (`resetToEmpty`, apply). The list pages must not hide
 * that: a Create button that silently does nothing is worse than a
 * disabled one. So the pages disable Create while blocked and mount this
 * banner — while loading it explains the wait; after a failure it shows
 * the verbatim error and offers the same Retry the Config Center banner
 * has.
 */
import { AlertTriangle, Loader2 } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useAutoLoadConfig } from '@/hooks/useAutoLoadConfig'

export const SeedBlockedBanner: React.FC = () => {
  const { t } = useTranslation()
  const { seedBlocked, seedStatus, seedError, retry } = useAutoLoadConfig()

  if (!seedBlocked) return null
  const loading = seedStatus === 'loading'

  return (
    <div
      role="alert"
      data-testid="seed-blocked-banner"
      className={`flex flex-col justify-between gap-3 rounded-md border p-3 text-xs sm:flex-row sm:items-center ${
        loading
          ? 'border-status-warning/30 bg-status-warning/10 text-status-warning dark:text-status-warning'
          : 'border-status-error/30 bg-status-error/10 text-status-error'
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {loading ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0 space-y-1">
          <span>
            {loading ? t('configCenter.seedLoadPending') : t('configCenter.seedLoadFailed')}
          </span>
          {!loading && seedError && (
            <p className="break-all font-mono text-status-error/80">{seedError}</p>
          )}
        </div>
      </div>
      {!loading && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 text-xs"
          onClick={retry}
          disabled={loading}
        >
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
