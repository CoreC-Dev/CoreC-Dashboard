import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  description?: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id'>) => number
  dismiss: (id: number) => void
}

let seq = 0

/**
 * Global transient feedback. Page-local OperationResult strips remain the
 * place for form validation; this store is for outcomes that must be seen
 * wherever the operator currently is (writes, config apply, reconnects).
 * Capped at 3 so a burst of failures cannot bury the UI.
 */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = ++seq
    set((state) => ({ toasts: [...state.toasts.slice(-2), { ...toast, id }] }))
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

/** Imperative helper for non-component call sites. */
export function pushToast(toast: Omit<ToastItem, 'id'>): number {
  return useToastStore.getState().push(toast)
}
