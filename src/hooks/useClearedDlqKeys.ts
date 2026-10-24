import { useEffect, useState } from 'react'

/**
 * sessionStorage-backed set of dead-letter keys the operator has cleared.
 *
 * CoreC exposes no DELETE
 * endpoint for dead letters, so "Clear All" is a client-side hide. Without
 * persistence the cleared set would be lost on unmount/refresh and the
 * cleared entries would reappear.
 */

const DLQ_CLEARED_KEY = 'corec_dlq_cleared'
// Cap the persisted cleared-key set so sessionStorage cannot grow unbounded
//. Set preserves insertion order, so the oldest entries are
// dropped first when the cap is exceeded.
const MAX_CLEARED_DLQ_KEYS = 200

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

  // Persist cleared keys to sessionStorage whenever they change.
  useEffect(() => {
    try {
      // Cap to the most recent MAX_CLEARED_DLQ_KEYS entries before persisting
      //.
      const arr = [...clearedDlqKeys]
      const toStore = arr.length > MAX_CLEARED_DLQ_KEYS ? arr.slice(-MAX_CLEARED_DLQ_KEYS) : arr
      sessionStorage.setItem(DLQ_CLEARED_KEY, JSON.stringify(toStore))
    } catch {
      // sessionStorage may be unavailable (private mode) — silently ignore.
    }
  }, [clearedDlqKeys])

  return { clearedDlqKeys, setClearedDlqKeys }
}
