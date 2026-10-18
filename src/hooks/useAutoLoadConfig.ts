import { useEffect, useRef } from 'react'
import { ApiError, extractApiError } from '@/api/client'
import { useConfigRaw } from '@/api/hooks'
import { isSeedBlocked, useConfigStore } from '@/stores/configStore'

/**
 * Auto-load the live server config into configStore on first mount.
 *
 * Without this, the store is only seeded inside `useConfigCenter` (Config
 * Center page).  When an operator lands on a different admin page first
 * (e.g. Drivers — the default redirect), `workingConfig` is null and the
 * first "Create" calls `resetToEmpty()`, which would discard `global.api`
 * from the server's minimal config.  The subsequent Apply would then PUT a
 * config with no `global` section — silently shutting down the control plane.
 *
 * This hook is mounted at the `AppShell` level so it runs regardless of which
 * admin page is visited first.  It delegates to `configStore.seedFromServer`,
 * which is a no-op once both `workingConfig` and `savedConfig` are set.
 *
 * D-16 (P0): the hook is also isError-aware.  When the fetch fails (backend
 * just restarted, transient 401, timeout) it records the failure in the
 * store (`seedStatus: 'failed'`), which blocks the destructive paths —
 * `resetToEmpty` refuses to start an empty config and `useApplyConfig`
 * refuses to PUT — until a retry succeeds.  The old behavior silently
 * skipped seeding, so the first "Create" wiped the control plane on Apply.
 *
 * Returns the shared seed status so any admin page can render the failure
 * banner (「服务器配置加载失败，创建/应用已禁用以保护运行中的配置」)
 * with a Retry button, and disable Create/Apply buttons proactively.
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
