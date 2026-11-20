import { useEffect, useRef } from 'react'
import { ApiError, extractApiError } from '@/api/client'
import { useConfigRaw } from '@/api/hooks'
import { isSeedBlocked, useConfigStore } from '@/stores/configStore'

/**
 * Auto-seed configStore from GET /configs/raw on admin mount (AppShell's
 * AdminConfigSeed), regardless of which admin page is visited first.
 * Fetch/parse failure records seedStatus 'failed', blocking resetToEmpty
 * and apply until retry. Exposes seedStatus/seedError/seedBlocked/retry.
 */
export function useAutoLoadConfig() {
  const rawConfigQuery = useConfigRaw()
  const seedFromServer = useConfigStore((s) => s.seedFromServer)
  const markSeedLoading = useConfigStore((s) => s.markSeedLoading)
  const markSeedReady = useConfigStore((s) => s.markSeedReady)
  const markSeedFailed = useConfigStore((s) => s.markSeedFailed)
  const savedConfig = useConfigStore((s) => s.savedConfig)
  const seedStatus = useConfigStore((s) => s.seedStatus)
  const seedError = useConfigStore((s) => s.seedError)
  const seeded = useRef(false)

  useEffect(() => {
    // Once the store has a baseline it stays protected; a later background
    // refetch failure must not flip the banner back on.
    if (useConfigStore.getState().seedStatus === 'ready') return
    const yamlText = rawConfigQuery.data
    if (yamlText?.trim()) {
      if (!seeded.current) {
        seeded.current = true
        const err = seedFromServer(yamlText)
        if (err) {
          // The server sent config YAML our parser rejects — treat like a
          // failed load: creating/applying without a baseline stays blocked.
          markSeedFailed(err)
          return
        }
      }
      markSeedReady()
      return
    }
    if (rawConfigQuery.isError) {
      const err = rawConfigQuery.error
      const msg =
        err instanceof ApiError
          ? extractApiError(err.body, err.message)
          : err instanceof Error
            ? err.message
            : String(err)
      markSeedFailed(msg)
      return
    }
    if (rawConfigQuery.isLoading || rawConfigQuery.isFetching) {
      markSeedLoading()
    }
  }, [
    rawConfigQuery.data,
    rawConfigQuery.isError,
    rawConfigQuery.error,
    rawConfigQuery.isLoading,
    rawConfigQuery.isFetching,
    seedFromServer,
    markSeedLoading,
    markSeedReady,
    markSeedFailed,
  ])

  /** Retry the seed fetch (banner "Retry" button). A success re-runs the
   *  effect above, seeds the store, and lifts the block. */
  const retry = () => {
    void rawConfigQuery.refetch()
  }

  return {
    /** Current auto-seed status from the store. */
    seedStatus,
    /** Raw diagnostic string for the last seed failure. */
    seedError,
    /** True when Create/Apply must stay blocked (no baseline + not seeded). */
    seedBlocked: isSeedBlocked({ savedConfig, seedStatus }),
    /** Re-run the GET /configs/raw fetch. */
    retry,
  }
}
