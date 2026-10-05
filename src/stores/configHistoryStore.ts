/**
 * Config change-history store (Zustand).
 *
 * A module-level singleton so that ANY config-modifying flow — not just the
 * ConfigCenterPage — can record a snapshot by calling `addSnapshot`.  Because
 * the state lives in a store rather than component-local `useState`, the
 * ChangeHistoryCard in ConfigCenterPage updates reactively even when the
 * snapshot was recorded by a different page (e.g. DriverDetailPage edit,
 * RulesPage inline edit, or an entity-list apply dialog).
 *
 * Snapshots are persisted to localStorage (capped to 10 entries) so the
 * operator can review and restore recent configurations across page reloads.
 */
import { create } from 'zustand'

const HISTORY_STORAGE_KEY = 'corec_config_history'
const MAX_HISTORY_SNAPSHOTS = 10

export interface ConfigSnapshot {
  timestamp: number
  yaml: string
  action: string
}

// Load persisted config snapshots from localStorage; tolerates malformed or
// missing data so a corrupted entry never crashes the page.
function loadHistory(): ConfigSnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (e): e is ConfigSnapshot =>
          typeof e === 'object' &&
          e !== null &&
          typeof e.timestamp === 'number' &&
          typeof e.yaml === 'string' &&
          typeof e.action === 'string',
      )
      .slice(0, MAX_HISTORY_SNAPSHOTS)
  } catch {
    return []
  }
}

// Persist snapshots (capped to MAX_HISTORY_SNAPSHOTS); swallows quota /
// serialize errors so a failing storage backend never blocks the submit flow.
function persistHistory(entries: ConfigSnapshot[]): void {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_HISTORY_SNAPSHOTS)),
    )
  } catch {
    // ignore — history is best-effort
  }
}

export interface ConfigHistoryState {
  history: ConfigSnapshot[]
  /** Record a config snapshot.  Call this after every successful PUT /configs. */
  addSnapshot: (yaml: string, action?: string) => void
  /** Re-read history from localStorage.  Useful after external storage changes. */
  reset: () => void
}

export const useConfigHistoryStore = create<ConfigHistoryState>((set) => ({
  history: loadHistory(),
  addSnapshot: (yaml: string, action: string = 'PUT /configs') => {
    const snapshot: ConfigSnapshot = { timestamp: Date.now(), yaml, action }
    set((prev) => {
      const next = [snapshot, ...prev.history].slice(0, MAX_HISTORY_SNAPSHOTS)
      persistHistory(next)
      return { history: next }
    })
  },
  reset: () => set({ history: loadHistory() }),
}))
