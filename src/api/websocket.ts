import { useConnectionStore } from '@/stores/connectionStore'

export type WSStatus = 'connecting' | 'open' | 'closed' | 'error' | 'rejected'

export class CoreCWebSocket<T = any> {
  private path: string
  private params: Record<string, string>
  private ws: WebSocket | null = null
  private onMessageCallback: (data: T) => void
  private onStatusCallback?: (status: WSStatus) => void
  private isDestroyed = false
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private baseDelay = 1000
  private maxDelay = 30000
  /** Max consecutive failures before giving up (stops infinite reconnect). */
  private maxRetries = 10
  /** Whether the socket has successfully opened at least once. */
  private everOpened = false
  /**
   * Max messages per second before dropping. High-frequency streams like
   * /tags/stream can flood the event loop; this cap protects consumers from
   * render thrashing. Messages above this rate are dropped (not queued).
   */
  private maxMsgPerSec = 500
  /** Sliding window of recent message timestamps (ms). */
  private msgTimestamps: number[] = []
  /** Number of messages dropped due to backpressure (for diagnostics). */
  droppedCount = 0

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

    // If baseUrl isn't available yet (e.g., during startup revalidation),
    // schedule a short retry instead of silently no-oping forever.
    if (!baseUrl) {
      this.reconnectTimeout = setTimeout(() => this.connect(), 500)
      return
    }

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
        this.everOpened = true
        this.onStatusCallback?.('open')
      }

      this.ws.onmessage = (event) => {
        // Real backpressure: sliding-window rate limiter. If the message
        // arrival rate exceeds maxMsgPerSec, drop this message to protect
        // the event loop from render thrashing on high-frequency streams
        // (e.g. /tags/stream on a large plant). The dropped counter is
        // surfaced in the Diagnostics UI.
        const now = Date.now()
        // Prune timestamps older than 1 second.
        while (this.msgTimestamps.length > 0 && now - this.msgTimestamps[0] > 1000) {
          this.msgTimestamps.shift()
        }
        if (this.msgTimestamps.length >= this.maxMsgPerSec) {
          this.droppedCount++
          return // drop this message
        }
        this.msgTimestamps.push(now)
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

      this.ws.onclose = (event) => {
        this.onStatusCallback?.('closed')
        // Detect upgrade rejection: the socket closed without ever opening,
        // and the close code indicates a rejection (1006 = abnormal, or
        // 1008/1011 = policy/error). This happens when the server rejects
        // the Origin (403) or the token (401). Surface it so pages can show
        // a meaningful error instead of silently reconnecting forever.
        if (
          !this.everOpened &&
          (event.code === 1006 || event.code === 1008 || event.code === 1011)
        ) {
          this.onStatusCallback?.('rejected')
        }
        this.scheduleReconnect()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return

    // Stop reconnecting if auth is gone (e.g. 401 cleared the secret) —
    // prevents livelock-reconnect with an invalid token.
    const { secret } = useConnectionStore.getState()
    if (!secret) {
      this.onStatusCallback?.('rejected')
      return
    }

    // Cap consecutive failures to avoid infinite reconnect loops when the
    // server is permanently unreachable or rejecting upgrades.
    if (this.retryCount >= this.maxRetries) {
      this.onStatusCallback?.('rejected')
      return
    }

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
