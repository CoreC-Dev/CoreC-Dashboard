import { useConnectionStore } from '@/stores/connectionStore'

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
 * Adds:
 * - Bearer token auth from the connection store.
 * - AbortController-based timeout (default 15s; overridable per-call via
 *   `options.signal` — caller-managed signals are respected and NOT
 *   auto-aborted).
 * - 401 handling: on unauthorized, clears the stored secret via `clearAuth()`
 *   so the RequireConnection gate redirects to /login instead of leaving the
 *   operator on a frozen page with stale data (a safety concern for a
 *   control dashboard).
 * - 204 No Content → returns undefined.
 */
export async function apiRequest<T = any>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { baseUrl, secret } = useConnectionStore.getState()
  const cleanBase = baseUrl.trim().replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = `${cleanBase}${cleanPath}`

  const headers = new Headers(options.headers || {})
  if (secret) {
    headers.set('Authorization', `Bearer ${secret}`)
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
      // 401 → credentials are invalid/expired/revoked. Clear the stored
      // secret so RequireConnection redirects to /login rather than leaving
      // the operator on a frozen page with stale data.
      if (res.status === 401) {
        useConnectionStore.getState().clearAuth()
      }
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
