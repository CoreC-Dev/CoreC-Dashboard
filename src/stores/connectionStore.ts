import { create } from 'zustand'
import { DEFAULT_COREC_URL } from '@/lib/constants'

interface ConnectionState {
  baseUrl: string
  secret: string
  isConnected: boolean
  isConnecting: boolean
  lastError: string | null
  serverVersion: string | null
  serverName: string | null
  setConnection: (url: string, secret: string) => void
  setConnected: (connected: boolean, info?: { name?: string; version?: string }) => void
  setError: (error: string | null) => void
  clearAuth: () => void
  disconnect: () => void
  revalidate: () => Promise<void>
}

const STORAGE_KEY = 'corec_connection'

/** Best-effort localStorage write — never throws on quota/privacy errors. */
const safePersist = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* QuotaExceededError, private mode, disabled storage — best-effort */
  }
}

/** Best-effort localStorage remove — never throws. */
const safeRemove = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* best-effort */
  }
}

const getInitialState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        baseUrl: parsed.baseUrl || DEFAULT_COREC_URL,
        secret: parsed.secret || '',
      }
    }
  } catch (e) {
    console.error('Failed to parse connection storage', e)
  }
  return {
    baseUrl: DEFAULT_COREC_URL,
    secret: '',
  }
}

const initial = getInitialState()

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  baseUrl: initial.baseUrl,
  secret: initial.secret,
  // If persisted credentials exist, treat the session as "connecting" while we
  // revalidate against the server on startup. This keeps RequireConnection
  // happy (baseUrl && secret truthy) AND lets React Query hooks run once the
  // probe resolves. Without this, a page reload leaves isConnected=false and
  // every query's `enabled` gate stays closed — the "refresh shows blank" bug.
  isConnected: false,
  isConnecting: !!(initial.baseUrl && initial.secret),
  lastError: null,
  serverVersion: null,
  serverName: null,

  setConnection: (url: string, secret: string) => {
    const cleanedUrl = url.trim().replace(/\/+$/, '')
    safePersist(STORAGE_KEY, JSON.stringify({ baseUrl: cleanedUrl, secret }))
    set({ baseUrl: cleanedUrl, secret, lastError: null })
  },

  setConnected: (connected, info) => {
    set({
      isConnected: connected,
      isConnecting: false,
      lastError: connected ? null : 'Disconnected',
      serverName: info?.name ?? null,
      serverVersion: info?.version ?? null,
    })
  },

  setError: (error) => set({ lastError: error, isConnecting: false, isConnected: false }),

  // Called on 401 (auth failure / revoked token). Clears the stored secret so
  // RequireConnection redirects to /login instead of leaving the operator on a
  // frozen page with stale data. For an industrial control dashboard, a
  // silently-frozen view is a safety concern.
  clearAuth: () => {
    safeRemove(STORAGE_KEY)
    set({
      secret: '',
      isConnected: false,
      isConnecting: false,
      lastError: 'Authentication failed — please reconnect',
      serverName: null,
      serverVersion: null,
    })
  },

  disconnect: () => {
    safeRemove(STORAGE_KEY)
    set({
      secret: '',
      isConnected: false,
      isConnecting: false,
      lastError: null,
      serverName: null,
      serverVersion: null,
    })
  },

  // Probe the persisted endpoint on app startup (called from App.tsx mount).
  // On success, flip isConnected to true so React Query hooks activate.
  // On failure, clear the connecting flag so the user is sent to /login.
  // Uses AbortController so a hung host can't leave isConnecting stuck forever.
  revalidate: async () => {
    const { baseUrl, secret } = get()
    if (!baseUrl || !secret) {
      set({ isConnecting: false })
      return
    }
    set({ isConnecting: true })
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(`${baseUrl}/`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: ctrl.signal,
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const info = await res.json()
      set({
        isConnected: true,
        isConnecting: false,
        lastError: null,
        serverName: info?.name ?? null,
        serverVersion: info?.version ?? null,
      })
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Connection timed out'
            : err.message
          : 'Revalidation failed'
      set({
        isConnected: false,
        isConnecting: false,
        lastError: errMsg,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  },
}))
