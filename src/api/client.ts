import { getActiveConnection } from './activeConnection'

export class ApiError extends Error {
  status: number
  body: string

  constructor(status: number, message: string, body = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Default request timeout — prevents hung CoreC from piling up in-flight calls. */
const DEFAULT_TIMEOUT_MS = 15_000

/** Extended request options — adds timeoutMs on top of standard RequestInit. */
export interface ApiRequestOptions extends RequestInit {
  /** Override the default 15s timeout (milliseconds). */
  timeoutMs?: number
}

/**
 * CoreC REST API request wrapper.
 *
 * Reads connection parameters (baseUrl + secret) from the active connection
 * singleton, which is set by the ConnectionProvider when the user enters a
 * `/corec/:id/*` route.
 *
 * Adds:
 * - Bearer token auth from the active connection.
 * - AbortController-based timeout (default 15s; overridable per-call via
 *   `options.signal` — caller-managed signals are respected and NOT
 *   auto-aborted).
 * - 401 handling: throws ApiError with status 401 so the ConnectionProvider
 *   can react (show reconnect prompt) instead of leaving the operator on a
 *   frozen page with stale data.
 * - 204 No Content → returns undefined.
 */
export async function apiRequest<T = any>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const conn = getActiveConnection()
  if (!conn) {
    throw new ApiError(0, 'No active CoreC instance — navigate to /corec/:id/* first')
  }

  const cleanBase = conn.baseUrl.trim().replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${cleanBase}${cleanPath}`

  const headers = new Headers(options.headers || {})
  if (conn.secret) {
    headers.set('Authorization', `Bearer ${conn.secret}`)
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  // If the caller already provided a signal, respect it. Otherwise create
  // an auto-timeout signal so a hung server can't pile up in-flight requests.
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const signal =
    options.signal ??
    (() => {
      const ctrl = new AbortController()
      timeoutId = setTimeout(() => ctrl.abort(), timeoutMs)
      return ctrl.signal
    })()

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      throw new ApiError(
        res.status,
        `API request failed: ${res.status} ${res.statusText}`,
        errorText,
      )
    }

    if (res.status === 204) {
      return undefined as unknown as T
    }

    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return res.json()
    }

    return (await res.text()) as unknown as T
  } catch (err: unknown) {
    // AbortError from our timeout → translate to a clearer message.
    if (err instanceof Error && err.name === 'AbortError' && timeoutId) {
      throw new ApiError(408, `Request timed out after ${timeoutMs}ms: ${path}`)
    }
    throw err
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
