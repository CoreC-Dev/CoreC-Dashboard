/**
 * Config change-history management hook.
 *
 * Extracted from ConfigCenterPage.tsx to reduce the god component's state
 * surface. Persists config snapshots to localStorage (capped to 10 entries)
 * so the operator can review and restore recent configurations.
 */
import { useCallback, useState } from 'react'

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

export function useConfigHistory() {
  const [history, setHistory] = useState<ConfigSnapshot[]>(() => loadHistory())

  const addSnapshot = useCallback((yaml: string, action: string = 'PUT /configs') => {
    const snapshot: ConfigSnapshot = { timestamp: Date.now(), yaml, action }
    setHistory((prev) => {
      const next = [snapshot, ...prev].slice(0, MAX_HISTORY_SNAPSHOTS)
      persistHistory(next)
      return next
    })
  }, [])

  return { history, addSnapshot }
}
