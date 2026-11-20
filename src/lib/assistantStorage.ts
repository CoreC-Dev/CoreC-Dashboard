/**
 * lib/assistantStorage.ts - provider settings persistence.
 *
 * Provider 设置（含 apiKey）存 localStorage（dashboard 侧凭据，不写入服务端
 * config）；密钥只留在本浏览器，设置 UI 须明示披露。
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
    // Corrupt storage → empty list (recoverable by re-entering the provider).
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
