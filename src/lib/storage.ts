/** Best-effort localStorage write — never throws on quota/privacy errors. */
export const safePersist = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* QuotaExceededError, private mode, disabled storage — best-effort */
  }
}
