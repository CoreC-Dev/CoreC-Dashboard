/**
 * Config change-history store: any config-modifying flow records a snapshot
 * via `addSnapshot`; ChangeHistoryCard in ConfigCenterPage updates
 * reactively across pages. Snapshots persist to localStorage, capped to
 * MAX_HISTORY_SNAPSHOTS entries.
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
