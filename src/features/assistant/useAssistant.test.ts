// @vitest-environment jsdom
// The hook owns the transcript rules the component only renders:
// a failed turn must land in `error` (not a half-written assistant bubble), and
// a write confirmation must pause the turn until a human answers. Both are
// invisible from the panel's JSX, so they are pinned here.
import { act, cleanup, configure, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssistant } from '@/features/assistant/useAssistant'
import type { AssistantProvider } from '@/types/assistant'

configure({ asyncUtilTimeout: 4000 })

const provider: AssistantProvider = { name: 'p', baseUrl: 'http://llm.test/v1', model: 'm' }

/** Replaces the provider module's streamChat for one case. */
const streamChat = vi.fn()
vi.mock('@/features/assistant/provider', () => ({
  streamChat: (...args: unknown[]) => streamChat(...args),
}))

/** Replaces the tool list so the confirm callback is observable. */
const assistantTools = vi.fn()
vi.mock('@/features/assistant/tools', () => ({
  assistantTools: (...args: unknown[]) => assistantTools(...args),
}))

const readTool = {
  name: 'list_drivers',
  description: 'list',
  schema: { type: 'object', properties: {}, required: [] },
  toolClass: 'read' as const,
  execute: vi.fn(async () => ({ content: '{"drivers":[]}', summary: '0 drivers' })),
}

beforeEach(() => {
  streamChat.mockReset()
  assistantTools.mockReturnValue([readTool])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useAssistant', () => {
  it('appends the user message then the assistant answer', async () => {
    streamChat.mockImplementationOnce(
      async (_p: AssistantProvider, _h: unknown, _t: unknown, onDelta: (d: string) => void) => {
        onDelta('3 ')
        onDelta('drivers.')
        return {
          content: '3 drivers.',
          toolCalls: [],
          messages: [{ role: 'assistant', content: '3 drivers.' }],
        }
      },
    )

    const { result } = renderHook(() => useAssistant(provider, false))
    await act(async () => {
      await result.current.send('  how many?  ')
    })

    await waitFor(() => expect(result.current.entries).toHaveLength(2))
    expect(result.current.entries[0]).toEqual({ role: 'user', text: 'how many?' })
    expect(result.current.entries[1].text).toBe('3 drivers.')
    expect(result.current.streaming).toBe(false)
  })

  it('surfaces a provider failure as error and does not keep a half turn', async () => {
    streamChat.mockRejectedValueOnce(new Error('401 invalid key'))

    const { result } = renderHook(() => useAssistant(provider, false))
    await act(async () => {
      await result.current.send('hi')
    })

    await waitFor(() => expect(result.current.error).toBe('401 invalid key'))
    expect(result.current.streaming).toBe(false)
    expect(result.current.draft).toBe('')
  })

  it('ignores an empty message', async () => {
    const { result } = renderHook(() => useAssistant(provider, false))
    await act(async () => {
      await result.current.send('   ')
    })
    expect(streamChat).not.toHaveBeenCalled()
    expect(result.current.entries).toHaveLength(0)
  })

  it('passes allowWrite through to the tool list on each send', async () => {
    streamChat.mockResolvedValueOnce({ content: 'ok', toolCalls: [], messages: [] })

    const { result } = renderHook(() => useAssistant(provider, true))
    await act(async () => {
      await result.current.send('hi')
    })

    expect(assistantTools).toHaveBeenCalledWith(true)
  })
})
