/**
 * Debounced value hook.
 *
 * Returns a debounced copy of `value` that only updates after `delayMs`
 * of quiet time. Useful for feeding expensive computations (e.g. O(m×n)
 * LCS diff) from fast-changing inputs (e.g. editor keystrokes) without
 * recomputing on every change.
 */
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
