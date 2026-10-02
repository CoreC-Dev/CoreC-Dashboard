/** Best-effort localStorage write — never throws on quota/privacy errors. */
export const safePersist = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* QuotaExceededError, private mode, disabled storage — best-effort */
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
export const safePersistSession = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* QuotaExceededError, private mode, disabled storage — best-effort */
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
