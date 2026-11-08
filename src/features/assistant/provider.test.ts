// @vitest-environment node
// streamChat only uses fetch/Response/ReadableStream (Node globals); the jsdom
// environment does not expose ReadableStream, so this suite runs in node.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from '@/features/assistant/provider'
import type { AssistantProvider } from '@/types/assistant'

const provider: AssistantProvider = {
  name: 'test',
  baseUrl: 'http://llm.test/v1',
  model: 'm',
  apiKey: 'k',
}

/** Feeds the given SSE chunks through a fake streaming fetch. */
function mockStream(chunks: string[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('streamChat', () => {
  it('posts to /chat/completions with the bearer key and streams prose', async () => {
    const spy = mockStream([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
      'data: [DONE]\n',
    ])
    const seen: string[] = []
    const turn = await streamChat(
      provider,
      [{ role: 'user', content: 'hi' }],
      [],
      (d) => seen.push(d),
      new AbortController().signal,
    )

    expect(seen).toEqual(['Hel', 'lo'])
    expect(turn.content).toBe('Hello')
    expect(turn.toolCalls).toEqual([])

    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://llm.test/v1/chat/completions')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer k')
  })

  it('omits Authorization for a gateway with no key', async () => {
    const spy = mockStream(['data: [DONE]\n'])
    await streamChat(
      { ...provider, apiKey: undefined },
      [],
      [],
      () => {},
      new AbortController().signal,
    )
    const [, init] = spy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Headers).get('Authorization')).toBeNull()
  })
  /** Builds one SSE chunk from a tool_calls delta, JSON-encoding it properly. */
  function toolChunk(delta: { index: number; id?: string; name?: string; args?: string }): string {
    const toolCall: Record<string, unknown> = { index: delta.index }
    if (delta.id) toolCall.id = delta.id
    const fn: Record<string, string> = {}
    if (delta.name) fn.name = delta.name
    if (delta.args !== undefined) fn.arguments = delta.args
    toolCall.function = fn
    return `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [toolCall] } }] })}\n`
  }

  it('accumulates tool-call fragments by index', async () => {
    mockStream([
      toolChunk({ index: 0, id: 'call_a', name: 'list_drivers', args: '' }),
      toolChunk({ index: 0, args: '{}' }),
      toolChunk({ index: 1, id: 'call_b', name: 'list_tags', args: '{"' }),
      toolChunk({ index: 1, args: 'driver":"p"}' }),
      'data: [DONE]\n',
    ])
    const turn = await streamChat(
      provider,
      [],
      [{ type: 'function', function: { name: 'x', description: '', parameters: {} } }],
      () => {},
      new AbortController().signal,
    )
    expect(turn.toolCalls).toEqual([
      { id: 'call_a', name: 'list_drivers', arguments: '{}' },
      { id: 'call_b', name: 'list_tags', arguments: '{"driver":"p"}' },
    ])
  })

  it('surfaces the provider error body rather than a bare status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 }),
    )
    await expect(
      streamChat(provider, [], [], () => {}, new AbortController().signal),
    ).rejects.toThrow(/404 model not found/)
  })
})
