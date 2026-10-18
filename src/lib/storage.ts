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

/**
 * Best-effort sessionStorage write — never throws on quota/privacy errors.
 * Used for sensitive data (e.g. API secrets) that should not persist
 * beyond the current browser tab session, reducing the exposure window
 * if an XSS attack reads stored credentials.
 */
export const safePersistSession = (key: string, value: string): boolean => {
  try {
    sessionStorage.setItem(key, value)
    return true
  } catch {
    /* QuotaExceededError, private mode, disabled storage — best-effort */
    return false
  }
}

/** Best-effort sessionStorage read — returns null on error. */
export const safeReadSession = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
