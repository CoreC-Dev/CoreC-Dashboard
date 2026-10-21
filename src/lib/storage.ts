/**
 * Best-effort localStorage write — never throws on quota/privacy errors.
 * Returns false when the write failed so callers can surface the data-loss
 * risk instead of silently swallowing it (A-11).
 */
export const safePersist = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    /* QuotaExceededError, private mode, disabled storage — best-effort */
    return false
  }
}

/** Best-effort localStorage read — returns null on error. */
export const safeRead = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
