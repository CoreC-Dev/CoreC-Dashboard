import { create } from 'zustand'

/**
 * Lightweight connection-state mirror for api/hooks to read `isConnected`
 * without importing from contexts/ (breaks the api↔contexts cycle, TD-ARCH-002).
 *
 * The ConnectionProvider owns the source of truth (local useState + probe
 * effect) and syncs `isConnected` here. Only one provider is mounted at a
 * time (per-instance route), so a global store is safe.
 */
interface ConnectionState {
  isConnected: boolean
  setConnected: (connected: boolean) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),
}))
