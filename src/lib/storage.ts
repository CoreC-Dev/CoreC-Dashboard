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
