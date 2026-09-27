import { useConnectionStore } from '@/stores/connectionStore'

export type WSStatus = 'connecting' | 'open' | 'closed' | 'error'

export class CoreCWebSocket<T = any> {
  private path: string
  private params: Record<string, string>
  private ws: WebSocket | null = null
  private onMessageCallback: (data: T) => void
  private onStatusCallback?: (status: WSStatus) => void
  private isDestroyed = false
  private reconnectTimeout: any = null
  private retryCount = 0
  private baseDelay = 1000
  private maxDelay = 30000

  constructor(
    path: string,
    params: Record<string, string> = {},
    onMessage: (data: T) => void,
    onStatus?: (status: WSStatus) => void,
  ) {
    this.path = path.startsWith('/') ? path : `/${path}`
    this.params = params
    this.onMessageCallback = onMessage
    this.onStatusCallback = onStatus
    this.connect()
  }

  private connect() {
    if (this.isDestroyed) return

    const { baseUrl, secret } = useConnectionStore.getState()
    if (!baseUrl) return

    // Convert http/https to ws/wss
    const wsBase = baseUrl.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://')
    const url = new URL(`${wsBase}${this.path}`)

    if (secret) {
      url.searchParams.set('token', secret)
    }

    Object.entries(this.params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        url.searchParams.set(key, val)
      }
    })

    this.onStatusCallback?.('connecting')

    try {
      this.ws = new WebSocket(url.toString())

      this.ws.onopen = () => {
        this.retryCount = 0
        this.onStatusCallback?.('open')
      }

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          this.onMessageCallback(parsed)
        } catch {
          this.onMessageCallback(event.data as unknown as T)
        }
      }

      this.ws.onerror = () => {
        this.onStatusCallback?.('error')
      }

      this.ws.onclose = () => {
        this.onStatusCallback?.('closed')
        this.scheduleReconnect()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return

    // Exponential backoff with ±20% jitter
    const delay = Math.min(this.baseDelay * 1.5 ** this.retryCount, this.maxDelay)
    const jitter = delay * (0.8 + Math.random() * 0.4)
    this.retryCount++

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, jitter)
  }

  public updateParams(newParams: Record<string, string>) {
    this.params = { ...this.params, ...newParams }
    this.reconnect()
  }

  public reconnect() {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    clearTimeout(this.reconnectTimeout)
    this.connect()
  }

  public destroy() {
    this.isDestroyed = true
    clearTimeout(this.reconnectTimeout)
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
