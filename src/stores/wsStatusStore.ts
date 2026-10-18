import { create } from 'zustand'
import type { WSStatus } from '@/api/websocket'

/**
 * wsStatusStore — aggregation of the live CoreC WebSocket streams' connection
 * states for the CURRENT instance (audit B01/D-02).
 *
 * Every mounted stream (useCoreCWebSocket consumers are wired automatically;
 * manual CoreCWebSocket consumers — /tags/stream and the global /logs alert
 * provider — call registerStream themselves) reports its WSStatus here and
 * detaches on unmount. The store derives:
 *  - an aggregate health for the AppShell "实时流" badge (bound to REAL
 *    socket state instead of the one-shot HTTP probe), and
 *  - a page-level banner state for the monitor pages (disconnected /
 *    rejected / rate-limited).
 *
 * `downOnce` distinguishes the initial handshake ('connecting', never
 * failed — no banner, amber badge) from a reconnect cycle ('connecting'
 * after a drop — banner + red badge), so a page load never flashes a scary
 * banner for a socket that is merely opening.
 */

export interface WsStreamState {
  status: WSStatus
  /** epoch ms of the last data activity (registration / open / message). */
  lastActivityAt: number
  /** true once this stream left 'open' involuntarily (closed/error/rejected). */
  downOnce: boolean
  /** frames dropped by the 500 msg/s limiter in the last reported window. */
  recentDropped: number
  /** epoch ms of the last drop report (drives the rate-limit hint window). */
  lastDropAt: number
}

/** Minimal surface a registered stream needs to expose for retry wiring. */
type ReconnectHandle = () => void

interface WsStatusStore {
  streams: Record<string, WsStreamState>
  /**
   * Register a stream and get back its status sink (wire to CoreCWebSocket's
   * onStatus). Registering resets the entry to 'connecting'.
   */
  registerStream: (id: string) => (status: WSStatus) => void
  /** Attach the stream's manual-reconnect handle (CoreCWebSocket.reconnect). */
  attachReconnect: (id: string, handle: ReconnectHandle) => void
  /** Detach a stream on unmount (drops its state entry and reconnect handle). */
  unregisterStream: (id: string) => void
  /** Activity ping from message handlers; throttled internally to ≥1s apart. */
  touchStream: (id: string) => void
  /** Rate-limit drop report from CoreCWebSocket's onDrop callback. */
  reportDropped: (id: string, count: number) => void
  /** Manually reconnect every stream currently in 'rejected' (banner button). */
  retryRejectedStreams: () => void
  /** Clear all entries (test/teardown helper; streams self-drain via detach). */
  reset: () => void
}

/** Reconnect handles keyed by stream id — not reactive UI state. */
const reconnectHandles = new Map<string, ReconnectHandle>()

/** Module-sequence generator for unique per-mount stream ids. */
let streamSeq = 0
export function makeStreamId(label: string): string {
  streamSeq += 1
  return `${label}#${streamSeq}`
}

export const useWsStatusStore = create<WsStatusStore>((set, get) => ({
  streams: {},

  registerStream: (id) => {
    set((state) => ({
      streams: {
        ...state.streams,
        [id]: {
          status: 'connecting',
          lastActivityAt: Date.now(),
          downOnce: false,
          recentDropped: 0,
          lastDropAt: 0,
        },
      },
    }))
    return (status: WSStatus) => {
      // Ignore late reports from a stream that was already detached
      // (unregistered) — its socket should be destroyed, but be defensive.
      if (!(id in get().streams)) return
      set((state) => {
        const prev = state.streams[id]
        if (!prev) return state
        return {
          streams: {
            ...state.streams,
            [id]: {
              ...prev,
              status,
              // A drop can only happen while frames flow — clear the hint
              // on any state transition so it can't linger stale.
              recentDropped: 0,
              lastDropAt: 0,
              downOnce: status === 'open' ? false : status === 'connecting' ? prev.downOnce : true,
              ...(status === 'open' ? { lastActivityAt: Date.now() } : {}),
            },
          },
        }
      })
    }
  },

  attachReconnect: (id, handle) => {
    reconnectHandles.set(id, handle)
  },

  unregisterStream: (id) => {
    reconnectHandles.delete(id)
    set((state) => {
      if (!(id in state.streams)) return state
      const next = { ...state.streams }
      delete next[id]
      return { streams: next }
    })
  },

  touchStream: (id) => {
    const now = Date.now()
    const entry = get().streams[id]
    // Throttle: the /tags/stream handler calls this per message (up to
    // ~500/s); one store write per second per stream is plenty for a
    // "last update {{time}}" banner.
    if (!entry || now - entry.lastActivityAt < 1000) return
    set((state) => {
      const prev = state.streams[id]
      if (!prev) return state
      return { streams: { ...state.streams, [id]: { ...prev, lastActivityAt: now } } }
    })
  },

  reportDropped: (id, count) => {
    set((state) => {
      const prev = state.streams[id]
      if (!prev) return state
      return {
        streams: {
          ...state.streams,
          [id]: { ...prev, recentDropped: count, lastDropAt: Date.now() },
        },
      }
    })
  },

  retryRejectedStreams: () => {
    const { streams } = get()
    for (const [id, entry] of Object.entries(streams)) {
      if (entry.status !== 'rejected') continue
      reconnectHandles.get(id)?.()
    }
  },

  reset: () => {
    reconnectHandles.clear()
    set({ streams: {} })
  },
}))

// ─── Derived selectors ──────────────────────────────────────────────────────
// NOTE: components subscribe via these helpers. They MUST return a value that
// is stable for a given `streams` object reference (React's
// useSyncExternalStore compares snapshots with Object.is) — deriveAggregate
// returns a primitive, and the object-returning helpers memoize on the input
// reference.

export type WsAggregate = 'idle' | 'connecting' | 'open' | 'down' | 'rejected'

/** Worst-case health across all registered streams. */
export function deriveAggregate(streams: Record<string, WsStreamState>): WsAggregate {
  const list = Object.values(streams)
  if (list.length === 0) return 'idle'
  if (list.some((s) => s.status === 'rejected')) return 'rejected'
  // downOnce + not open ⇒ mid-reconnect after a drop (or closed/error) —
  // data is stale even though a retry is in flight.
  if (list.some((s) => s.downOnce && s.status !== 'open')) return 'down'
  if (list.some((s) => s.status !== 'open')) return 'connecting'
  return 'open'
}

export interface WsBannerInfo {
  kind: 'down' | 'rejected'
  /** Freshest data timestamp across streams — the "上次更新 {{time}}" value. */
  lastActivityAt: number
}

function computeBanner(streams: Record<string, WsStreamState>): WsBannerInfo | null {
  const aggregate = deriveAggregate(streams)
  if (aggregate !== 'down' && aggregate !== 'rejected') return null
  let last = 0
  for (const s of Object.values(streams)) {
    if (s.lastActivityAt > last) last = s.lastActivityAt
  }
  return { kind: aggregate, lastActivityAt: last }
}

// Single-entry memo (keyed on the streams object identity) so the selector
// returns the SAME object between store writes — required for
// useSyncExternalStore snapshot stability.
let bannerCache: { streams: Record<string, WsStreamState>; result: WsBannerInfo | null } | null =
  null

export function deriveBanner(streams: Record<string, WsStreamState>): WsBannerInfo | null {
  if (bannerCache && bannerCache.streams === streams) return bannerCache.result
  const result = computeBanner(streams)
  bannerCache = { streams, result }
  return result
}

/** Window during which the >500 msg/s drop hint stays visible. */
const RATE_LIMIT_HINT_MS = 3000

let rateCache: { streams: Record<string, WsStreamState>; result: boolean } | null = null

/** True while a stream reported limiter drops recently (≤3s ago). */
export function deriveRateLimited(streams: Record<string, WsStreamState>): boolean {
  if (rateCache && rateCache.streams === streams) return rateCache.result
  const now = Date.now()
  const result = Object.values(streams).some(
    (s) => s.recentDropped > 0 && now - s.lastDropAt < RATE_LIMIT_HINT_MS,
  )
  rateCache = { streams, result }
  return result
}
