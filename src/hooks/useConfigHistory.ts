/**
 * Config change-history management hook: thin wrapper around the Zustand
 * configHistoryStore, shared by every config-modifying flow. The store
 * persists snapshots to localStorage, capped to MAX_HISTORY_SNAPSHOTS.
 *
 * ConfigSnapshot re-exported from the store.
 */
import { useConfigHistoryStore } from '@/stores/configHistoryStore'

export type { ConfigSnapshot } from '@/stores/configHistoryStore'

export function useConfigHistory() {
  const history = useConfigHistoryStore((s) => s.history)
  const addSnapshot = useConfigHistoryStore((s) => s.addSnapshot)
  return { history, addSnapshot }
}
