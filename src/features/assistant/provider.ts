/**
 * features/assistant/provider.ts - the OpenAI-compatible chat client.
 *
 * Why a hand-written client and not a vendor SDK: the assistant must reach
 * ANY OpenAI-compatible endpoint (vLLM, LiteLLM, one-api, a cloud vendor's
 * compatible gateway), and the wire format it needs is one endpoint plus SSE
 * deltas. An SDK would add a dependency, a second set of error types, and a
 * retry policy we do not control, to save ~150 lines.
 *
 * Retries are deliberately absent: a chat completion is not idempotent and a
 * tool-calling turn may already have burned tokens. The caller shows the error
 * and the operator decides to send again.
 */
import type { AssistantMessage, AssistantProvider, ToolCall } from '@/types/assistant'

/** One outbound tool description, in OpenAI function-calling shape. */
export interface OutboundTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** What a provider turn produced: prose and/or tool calls. */
export interface ChatTurn {
  content: string
  toolCalls: ToolCall[]
}

export class ProviderError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
  }
}

/** The messages array in OpenAI wire shape. */
interface WireMessage {
  role: string
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  name?: string
}

function toWire(messages: AssistantMessage[]): WireMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' }
    }
    if (m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: m.role,
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
}

function headers(p: AssistantProvider): Headers {
  const h = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' })
  // Local gateways often have no auth; only send the header when a key exists
  // so we do not trip strict gateways on an empty "Bearer ".
  if (p.apiKey) h.set('Authorization', `Bearer ${p.apiKey}`)
  for (const [k, v] of Object.entries(p.headers ?? {})) h.set(k, v)
  return h
}

/** Reads a provider error body into a human sentence, verbatim where useful. */
async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  if (!body) return `HTTP ${res.status}`
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    if (typeof j.error === 'string') return `${res.status} ${j.error}`
    if (j.error && typeof j.error === 'object' && j.error.message)
      return `${res.status} ${j.error.message}`
    if (j.message) return `${res.status} ${j.message}`
  } catch {
    // not JSON - fall through to the raw text, clipped by the caller
  }
  return `${res.status} ${body.slice(0, 300)}`
}

/**
 * streamChat runs one provider turn, invoking onDelta for each content
 * fragment and resolving with the accumulated prose + tool calls.
 */
export async function streamChat(
  provider: AssistantProvider,
  messages: AssistantMessage[],
  tools: OutboundTool[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<ChatTurn> {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: toWire(messages),
    stream: true,
  }
  if (tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const res = await fetch(endpoint(provider.baseUrl), {
    method: 'POST',
    headers: headers(provider),
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new ProviderError(res.status, await errorText(res))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  // Tool-call fragments stream in by index; each carries part of the JSON args.
  const partial = new Map<number, { id: string; name: string; arguments: string }>()

  const consume = (line: string): boolean => {
    const trimmed = line.trim()
    if (!trimmed?.startsWith('data:')) return false
    const data = trimmed.slice(5).trim()
    if (data === '[DONE]') return true
    let chunk: {
      choices?: {
        delta?: {
          content?: string
          tool_calls?: {
            index: number
            id?: string
            function?: { name?: string; arguments?: string }
          }[]
        }
      }[]
    }
    try {
      chunk = JSON.parse(data)
    } catch {
      return false // a keep-alive or a comment line; ignore
    }
    const delta = chunk.choices?.[0]?.delta
    if (!delta) return false
    if (delta.content) {
      content += delta.content
      onDelta(delta.content)
    }
    for (const tc of delta.tool_calls ?? []) {
      const cur = partial.get(tc.index) ?? { id: '', name: '', arguments: '' }
      if (tc.id) cur.id = tc.id
      if (tc.function?.name) cur.name = tc.function.name
      if (tc.function?.arguments) cur.arguments += tc.function.arguments
      partial.set(tc.index, cur)
    }
    return false
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE events are newline-delimited; keep the trailing partial line.
    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      if (consume(line)) {
        reader.cancel().catch(() => undefined)
        return { content, toolCalls: toToolCalls(partial) }
      }
    }
  }
  if (buffer) consume(buffer)
  return { content, toolCalls: toToolCalls(partial) }
}

function toToolCalls(
  partial: Map<number, { id: string; name: string; arguments: string }>,
): ToolCall[] {
  return [...partial.entries()]
    .sort(([a], [b]) => a - b)
    .map(([idx, p], n) => ({
      id: p.id || `call_${idx}_${n}`,
      name: p.name,
      arguments: p.arguments,
    }))
    .filter((tc) => tc.name !== '')
}
