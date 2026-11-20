/**
 * Module-level active connection singleton（plain mutable reference）.
 *
 * The ConnectionProvider sets this when the user enters a `/corec/:id/*` route.
 * The API client and WebSocket layer read from it, so requests are scoped to
 * the current instance. React components that need to react to connection
 * state changes use the ConnectionContext instead.
 */

export interface ActiveConnection {
  instanceId: string
  baseUrl: string
  secret: string
  useProxy?: 'auto' | 'proxy' | 'direct'
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
