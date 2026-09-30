import { getActiveConnection } from './activeConnection'

export type WSStatus = 'connecting' | 'open' | 'closed' | 'error' | 'rejected'

export class CoreCWebSocket<T = unknown> {
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
  /** Index of the first unexpired timestamp — avoids O(n) Array.shift(). */
  private msgTimestampsHead = 0

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

    const conn = getActiveConnection()
    const baseUrl = conn?.baseUrl ?? ''
    const secret = conn?.secret ?? ''

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
        // (e.g. /tags/stream on a large plant).
        const now = Date.now()
        // Prune timestamps older than 1 second. Use a head index instead of
        // Array.shift() (which is O(n) per call → O(n²) at 500 msg/s).
        while (
          this.msgTimestampsHead < this.msgTimestamps.length &&
          now - this.msgTimestamps[this.msgTimestampsHead] > 1000
        ) {
          this.msgTimestampsHead++
        }
        // Compact the array when the head advances far enough.
        if (this.msgTimestampsHead > 256) {
          this.msgTimestamps = this.msgTimestamps.slice(this.msgTimestampsHead)
          this.msgTimestampsHead = 0
        }
        const activeCount = this.msgTimestamps.length - this.msgTimestampsHead
        if (activeCount >= this.maxMsgPerSec) {
          return // drop this message
        }
        this.msgTimestamps.push(now)
        try {
          const data = typeof event.data === 'string' ? event.data : String(event.data)
          const parsed = JSON.parse(data)
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

    // Stop reconnecting if auth is gone (e.g. left the instance route) —
    // prevents livelock-reconnect with an invalid token.
    const conn = getActiveConnection()
    if (!conn?.secret) {
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

  public destroy() {
    this.isDestroyed = true
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
    if (this.ws) {
      // Null all handlers so queued events can't fire after destroy.
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
