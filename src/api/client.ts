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

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
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

  const res = await fetch(url, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new ApiError(res.status, `API request failed: ${res.status} ${res.statusText}`, errorText)
  }

  if (res.status === 204) {
    return undefined as unknown as T
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return res.json()
  }

  return (await res.text()) as unknown as T
}
