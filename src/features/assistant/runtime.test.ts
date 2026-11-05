import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssistantProvider } from '@/types/assistant'

const provider: AssistantProvider = { name: 't', baseUrl: 'http://llm.test/v1', model: 'm' }

/**
 * importRuntime loads runtime with a stubbed provider module. Two guarantees
 * live only in runtime and cannot be observed from outside a mild fake:
 *  - the step budget stops a tool-calling model instead of looping forever;
 *  - a write-class tool reaches the model as "declined" when the operator says
 *    no, so it does not retry or claim success.
 */
async function importRuntime(
  turnFactory: () => {
    content: string
    toolCalls: { id: string; name: string; arguments: string }[]
  },
) {
  vi.resetModules()
  vi.doMock('@/features/assistant/provider', () => ({
    streamChat: vi.fn(async () => turnFactory()),
  }))
  return import('@/features/assistant/runtime')
}

function tool(name: string): {
  name: string
  description: string
  schema: Record<string, unknown>
  toolClass: 'read' | 'write'
  execute: (a: Record<string, unknown>) => Promise<{ content: string }>
} {
  return {
    name,
    description: name,
    schema: { type: 'object', properties: {}, required: [] },
    toolClass: ['write_tag', 'pause_driver', 'resume_driver', 'ack_alert'].includes(name)
      ? 'write'
      : 'read',
    execute: vi.fn(async () => ({ content: '{"ok":true}' })),
  }
}

const signal = () => new AbortController().signal

afterEach(() => {
  vi.doUnmock('@/features/assistant/provider')
  vi.restoreAllMocks()
})

describe('runTurn', () => {
  it('returns prose without touching tools when the model does not call one', async () => {
    const { runTurn } = await importRuntime(() => ({ content: '3 drivers.', toolCalls: [] }))
    const tools = [tool('list_drivers')]

    const res = await runTurn(
      provider,
      [{ role: 'user', content: 'how many?' }],
      tools,
      {
        onDelta: () => {},
        confirm: async () => true,
      },
      signal(),
    )

    expect(res.text).toBe('3 drivers.')
    expect(res.truncated).toBe(false)
    expect(tools[0].execute).not.toHaveBeenCalled()
  })

  it('executes a read-class tool without asking for confirmation', async () => {
    let call = 0
    const { runTurn } = await importRuntime(() => {
      call += 1
      return call === 1
        ? { content: '', toolCalls: [{ id: 'a', name: 'list_drivers', arguments: '{}' }] }
        : { content: 'there are 3', toolCalls: [] }
    })
    const confirm = vi.fn(async () => true)
    const tools = [tool('list_drivers')]

    const res = await runTurn(provider, [], tools, { onDelta: () => {}, confirm }, signal())

    expect(confirm).not.toHaveBeenCalled()
    expect(tools[0].execute).toHaveBeenCalledTimes(1)
    expect(res.text).toBe('there are 3')
  })

  it('asks before a write tool and reports a refusal truthfully', async () => {
    let call = 0
    let toolMessage = ''
    const { runTurn } = await importRuntime(() => {
      call += 1
      return call === 1
        ? {
            content: '',
            toolCalls: [{ id: 'w', name: 'write_tag', arguments: '{"driver":"d","tag":"t"}' }],
          }
        : { content: '', toolCalls: [] }
    })
    const confirm = vi.fn(async () => false)
    const tools = [tool('write_tag')]

    const res = await runTurn(
      provider,
      [],
      tools,
      {
        onDelta: () => {},
        confirm,
      },
      signal(),
    )

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(tools[0].execute).not.toHaveBeenCalled()
    toolMessage = res.messages.find((m) => m.role === 'tool')?.content ?? ''
    // The model must be told it was refused, in terms it cannot spin into success.
    expect(toolMessage).toContain('declined')
    expect(res.messages.find((m) => m.role === 'tool')?.toolError).toBeTruthy()
  })

  it('stops at the step budget instead of looping forever', async () => {
    // A model that always asks for one more tool call -- the pathological case.
    let call = 0
    const { runTurn } = await importRuntime(() => {
      call += 1
      return { content: '', toolCalls: [{ id: `c${call}`, name: 'list_drivers', arguments: '{}' }] }
    })
    const tools = [tool('list_drivers')]

    const res = await runTurn(
      provider,
      [],
      tools,
      { onDelta: () => {}, confirm: async () => true },
      signal(),
    )

    expect(res.truncated).toBe(true)
    // Bounded, not "until the model stops": the exact number is the budget.
    expect(vi.mocked(tools[0].execute).mock.calls.length).toBeLessThanOrEqual(8)
  })

  it('reports an unknown tool instead of throwing', async () => {
    let call = 0
    const { runTurn } = await importRuntime(() => {
      call += 1
      return call === 1
        ? { content: '', toolCalls: [{ id: 'x', name: 'no_such_tool', arguments: '{}' }] }
        : { content: 'done', toolCalls: [] }
    })

    const res = await runTurn(
      provider,
      [],
      [tool('list_drivers')],
      {
        onDelta: () => {},
        confirm: async () => true,
      },
      signal(),
    )

    const msg = res.messages.find((m) => m.role === 'tool')
    expect(msg?.toolError).toContain('unknown tool')
    expect(res.text).toBe('done')
  })
})
