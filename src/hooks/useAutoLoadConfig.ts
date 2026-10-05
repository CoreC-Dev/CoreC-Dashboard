import { useEffect, useRef } from 'react'
import { useConfigRaw } from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'

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
 */
export function useAutoLoadConfig() {
  const rawConfigQuery = useConfigRaw()
  const seedFromServer = useConfigStore((s) => s.seedFromServer)
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current) return
    const yamlText = rawConfigQuery.data
    if (!yamlText?.trim()) return
    seeded.current = true
    seedFromServer(yamlText)
  }, [rawConfigQuery.data, seedFromServer])
}
