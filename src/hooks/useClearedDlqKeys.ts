import { useEffect, useState } from 'react'

/**
 * sessionStorage-backed set of dead-letter keys the operator has cleared.
 *
 * Extracted from WriteControlPage (TD-CPLX-007). CoreC exposes no DELETE
 * endpoint for dead letters, so "Clear All" is a client-side hide. Without
 * persistence the cleared set was lost on unmount/refresh, so cleared entries
 * reappeared. [L-5]
 */

const DLQ_CLEARED_KEY = 'corec_dlq_cleared'

export function useClearedDlqKeys() {
  const [clearedDlqKeys, setClearedDlqKeys] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem(DLQ_CLEARED_KEY)
      if (stored) return new Set(JSON.parse(stored) as string[])
    } catch {
      // Ignore parse errors — start with an empty set.
    }
    return new Set()
  })

  // Persist cleared keys to sessionStorage whenever they change. [L-5]
  useEffect(() => {
    try {
      sessionStorage.setItem(DLQ_CLEARED_KEY, JSON.stringify([...clearedDlqKeys]))
    } catch {
      // sessionStorage may be unavailable (private mode) — silently ignore.
    }
  }, [clearedDlqKeys])

  return { clearedDlqKeys, setClearedDlqKeys }
}
