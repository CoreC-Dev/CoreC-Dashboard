import { create } from 'zustand'

interface UiState {
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
}

/** Cross-component UI flags that are not server state. */
export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}))
