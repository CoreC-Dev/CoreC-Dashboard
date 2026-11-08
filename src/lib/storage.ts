/**
 * Best-effort localStorage write — never throws on quota/privacy errors.
 * Returns false when the write failed so callers can surface the data-loss
 * risk instead of silently swallowing it.
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

/** Best-effort localStorage removal — never throws. */
export const safeRemove = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* storage disabled — nothing to remove */
  }
}

/** sessionStorage twin of safePersist (per-tab, cleared on browser close). */
export const safeSessionPersist = (key: string, value: string): boolean => {
  try {
    sessionStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** sessionStorage twin of safeRead. */
export const safeSessionRead = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/** sessionStorage twin of safeRemove. */
export const safeSessionRemove = (key: string): void => {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* storage disabled — nothing to remove */
  }
}
