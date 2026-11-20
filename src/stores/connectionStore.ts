import { create } from 'zustand'

/**
 * Connection-state mirror: api/hooks read `isConnected` here; api must not
 * import contexts (structure-lint). The ConnectionProvider owns the source
 * of truth (local useState + probe effect) and syncs `isConnected` here;
 * one provider is mounted at a time (per-instance route).
 */
interface ConnectionState {
  isConnected: boolean
  setConnected: (connected: boolean) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),
}))
