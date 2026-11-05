/**
 * stores/assistantStore.ts - provider settings + the
 * write switch, shared by the panel and the settings section.
 *
 * A module-level Zustand store rather than component state: the settings page
 * edits the provider while the panel consumes it, and they are not nested
 * (the panel is mounted in AppShell, the form in the settings route).
 */
import { useMemo } from 'react'
import { create } from 'zustand'
import {
  loadProviders,
  loadSelectedProvider,
  saveProviders,
  saveSelectedProvider,
} from '@/lib/assistantStorage'
import type { AssistantProvider } from '@/types/assistant'

interface AssistantSettingsState {
  providers: AssistantProvider[]
  selected: string | null
  /**
   * Write-class tools are off until the operator turns them on here. Default
   * false mirrors corec-mcp's read-only default; it is NOT persisted with the
   * providers so a reload never silently re-arms writes.
   */
  allowWrite: boolean
  setProviders: (list: AssistantProvider[], selected: string | null) => void
  setAllowWrite: (v: boolean) => void
}

export const useAssistantStore = create<AssistantSettingsState>((set) => {
  const providers = loadProviders()
  const current = loadSelectedProvider()
  return {
    providers,
    selected: current?.name ?? providers[0]?.name ?? null,
    allowWrite: false,
    setProviders: (list, selected) => {
      saveProviders(list)
      saveSelectedProvider(selected)
      set({ providers: list, selected })
    },
    setAllowWrite: (v) => set({ allowWrite: v }),
  }
})

/**
 * useAssistantSettings is the read side the panel and the form share: the
 * selected provider record and the write switch, in the shape the panel
 * already expects ({ provider, allowWrite, ...store actions }).
 */
export function useAssistantSettings() {
  const providers = useAssistantStore((s) => s.providers)
  const selected = useAssistantStore((s) => s.selected)
  const allowWrite = useAssistantStore((s) => s.allowWrite)
  const setProviders = useAssistantStore((s) => s.setProviders)
  const setAllowWrite = useAssistantStore((s) => s.setAllowWrite)

  return useMemo(
    () => ({
      providers,
      selected,
      provider: providers.find((p) => p.name === selected) ?? null,
      allowWrite,
      setProviders,
      setAllowWrite,
    }),
    [providers, selected, allowWrite, setProviders, setAllowWrite],
  )
}
