/**
 * lib/assistantStorage.ts - provider settings persistence.
 *
 * localStorage, not the server config: a provider key is a dashboard-side
 * credential (the same category as the instance API secrets in
 * instanceStore.ts), and writing it into CoreC's config.yaml would make it
 * visible to every API client and to GET /configs/raw. The key never leaves
 * this browser, which is also why the settings UI must say so.
 */
import type { AssistantProvider } from '@/types/assistant'

const PROVIDERS_KEY = 'corec_ai_providers'
const SELECTED_KEY = 'corec_ai_selected'

function readAll(): AssistantProvider[] {
  try {
    const raw = localStorage.getItem(PROVIDERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as AssistantProvider[]) : []
  } catch {
    // Corrupt storage is recoverable by re-entering the provider; crashing the
    // whole dashboard over a bad chat setting is not.
    return []
  }
}

export function loadProviders(): AssistantProvider[] {
  return readAll()
}

export function saveProviders(list: AssistantProvider[]): void {
  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(list))
}

export function loadSelectedProvider(): AssistantProvider | null {
  const name = localStorage.getItem(SELECTED_KEY)
  if (!name) return null
  return readAll().find((p) => p.name === name) ?? null
}

export function saveSelectedProvider(name: string | null): void {
  if (name === null) localStorage.removeItem(SELECTED_KEY)
  else localStorage.setItem(SELECTED_KEY, name)
}
