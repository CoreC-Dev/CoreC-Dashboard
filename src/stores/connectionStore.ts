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
  disconnect: () => void
}

const STORAGE_KEY = 'corec_connection'

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

export const useConnectionStore = create<ConnectionState>((set) => ({
  baseUrl: initial.baseUrl,
  secret: initial.secret,
  isConnected: false,
  isConnecting: false,
  lastError: null,
  serverVersion: null,
  serverName: null,

  setConnection: (url: string, secret: string) => {
    const cleanedUrl = url.trim().replace(/\/+$/, '')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ baseUrl: cleanedUrl, secret }))
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

  disconnect: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({
      secret: '',
      isConnected: false,
      isConnecting: false,
      lastError: null,
      serverName: null,
      serverVersion: null,
    })
  },
}))
