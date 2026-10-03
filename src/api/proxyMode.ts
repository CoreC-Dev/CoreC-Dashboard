/**
 * Proxy mode detection (ADR-004 addendum).
 *
 * ADR-004 introduced a same-origin proxy (`/corec-proxy/*` via server.mjs) for
 * security: the browser sends same-origin requests, server.mjs forwards them to
 * the real CoreC backend. This keeps CSP `connect-src 'self'` and prevents
 * credential leakage.
 *
 * However, when deployed to static hosting (e.g. GitHub Pages) there is no
 * server.mjs — the proxy endpoint returns 404. This module detects that
 * condition at startup and falls back to direct connections (fetch directly to
 * `baseUrl + path`). In direct mode, CSP is relaxed to `connect-src * ws: wss:`
 * and credentials travel to the backend in the browser (the pre-ADR-004
 * behavior). This is less secure but restores functionality on static hosts.
 *
 * Detection: probe `HEAD /corec-proxy/` once at startup.
 * - 404 → direct mode (static host, no proxy)
 * - any other status → proxy mode (server.mjs running)
 * - network error / timeout → direct mode (fallback)
 */

let mode: 'proxy' | 'direct' | null = null

/**
 * Probe the proxy endpoint and cache the result.
 * Call once at app startup before rendering (see main.tsx).
 */
export async function detectProxyMode(): Promise<'proxy' | 'direct'> {
  if (mode) return mode
  try {
    const res = await fetch('/corec-proxy/', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    })
    mode = res.status === 404 ? 'direct' : 'proxy'
  } catch {
    // Network error or timeout — assume direct mode (no proxy available).
    mode = 'direct'
  }
  return mode
}

/**
 * Get the cached proxy mode. Returns 'proxy' if detection hasn't run yet
 * (backward-compatible default for server.mjs deployments).
 */
export function getProxyMode(): 'proxy' | 'direct' {
  return mode ?? 'proxy'
}

/** Test hook: force a specific mode without probing. */
export function setProxyMode(m: 'proxy' | 'direct'): void {
  mode = m
}

/** Test hook: reset the cached mode so detectProxyMode re-probes. */
export function resetProxyMode(): void {
  mode = null
}

/**
 * Resolve the effective proxy mode for a specific instance.
 *
 * Per-instance setting (ADR-004a) takes precedence:
 * - 'proxy'  → force proxy (server.mjs forwards to backend)
 * - 'direct' → force direct (browser connects to backend)
 * - 'auto' / undefined → follow the global auto-detected mode
 */
export function resolveProxyMode(useProxy?: 'auto' | 'proxy' | 'direct'): 'proxy' | 'direct' {
  if (useProxy === 'proxy') return 'proxy'
  if (useProxy === 'direct') return 'direct'
  return getProxyMode()
}
