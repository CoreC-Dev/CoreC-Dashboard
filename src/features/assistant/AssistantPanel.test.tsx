// @vitest-environment jsdom
// The chat box must never be a way around the authorization rules that the
// tool layer enforces. These tests pin the two visible consequences:
//  - with no provider configured, it says so instead of rendering a dead input;
//  - with no provider there is no way to reach a tool call at all.
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from '@/features/assistant/AssistantPanel'
import i18n from '@/i18n'
import { useAssistantStore } from '@/stores/assistantStore'

configure({ asyncUtilTimeout: 4000 })

const t = (key: string) => i18n.t(key)

/**
 * Seeds the store the way the app does: through setProviders, which also writes
 * localStorage. Persisting the raw keys instead would exercise a path the UI
 * never uses and leave the in-memory store stale.
 */
function loadStore(providers: { name: string; baseUrl: string; model: string }[]) {
  localStorage.clear()
  useAssistantStore.setState({ providers: [], selected: null, allowWrite: false })
  if (providers.length > 0) {
    useAssistantStore.getState().setProviders(providers, providers[0]?.name ?? null)
  }
}

beforeEach(() => {
  loadStore([])
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('AssistantPanel', () => {
  it('opens with an explanation, not a dead input, when no provider is configured', () => {
    render(<AssistantPanel />)

    fireEvent.click(screen.getByRole('button', { name: t('assistant.open') }))

    expect(screen.getByText(t('assistant.noProvider'))).toBeTruthy()
    // No way to type a message that could never be sent.
    expect(screen.queryByLabelText(t('assistant.placeholder'))).toBeNull()
  })

  it('offers the composer once a provider exists', () => {
    loadStore([{ name: 'local', baseUrl: 'http://llm.test/v1', model: 'm' }])
    render(<AssistantPanel />)

    fireEvent.click(screen.getByRole('button', { name: t('assistant.open') }))

    expect(screen.getByLabelText(t('assistant.placeholder'))).toBeTruthy()
    expect(screen.getByText(t('assistant.intro'))).toBeTruthy()
  })

  it('keeps the composer disabled for an empty message', () => {
    loadStore([{ name: 'local', baseUrl: 'http://llm.test/v1', model: 'm' }])
    render(<AssistantPanel />)

    fireEvent.click(screen.getByRole('button', { name: t('assistant.open') }))
    const send = screen.getByRole('button', { name: t('assistant.send') }) as HTMLButtonElement

    expect(send.disabled).toBe(true)
  })
})
