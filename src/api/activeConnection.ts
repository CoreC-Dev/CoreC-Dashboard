/**
 * Module-level active connection singleton.
 *
 * The ConnectionProvider sets this when the user enters a `/corec/:id/*` route.
 * The API client and WebSocket layer read from it instead of a global store,
 * so requests are naturally scoped to the current instance.
 *
 * This is intentionally NOT a Zustand store — it's a plain mutable reference
 * that the provider owns. React components that need to react to connection
 * state changes use the ConnectionContext instead.
 */

export interface ActiveConnection {
  instanceId: string
  baseUrl: string
  secret: string
}

let active: ActiveConnection | null = null

/** Set the active connection (called by ConnectionProvider on mount). */
export function setActiveConnection(conn: ActiveConnection | null): void {
  active = conn
}

/** Get the current active connection (called by apiRequest / WebSocket). */
export function getActiveConnection(): ActiveConnection | null {
  return active
}

/** Convenience: is there an active connection with credentials? */
export function hasActiveConnection(): boolean {
  return active !== null && !!active.baseUrl && !!active.secret
}
