/**
 * Config change-history management hook.
 *
 * Thin wrapper around the Zustand configHistoryStore so that every
 * config-modifying flow (ConfigCenterPage, entity-list apply, entity-detail
 * edit, RulesPage inline edit) shares a single reactive history.  The store
 * persists snapshots to localStorage (capped to 10 entries) so the operator
 * can review and restore recent configurations.
 *
 * ConfigSnapshot is re-exported from the store for backward compatibility
 * with existing imports (e.g. ConfigCenterYaml.tsx).
 */
import { useConfigHistoryStore } from '@/stores/configHistoryStore'

export type { ConfigSnapshot } from '@/stores/configHistoryStore'

export function useConfigHistory() {
  const history = useConfigHistoryStore((s) => s.history)
  const addSnapshot = useConfigHistoryStore((s) => s.addSnapshot)
  return { history, addSnapshot }
}
