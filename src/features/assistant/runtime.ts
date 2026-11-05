/**
 * features/assistant/runtime.ts - one conversation turn, with tool calling.
 *
 * Loop: provider -> (tool calls?) -> execute -> feed back -> provider ... until
 * the model answers in prose, the step budget runs out, or the operator
 * cancels.
 *
 * Two guards are non-negotiable and are why this file exists rather than
 * calling the provider from a component:
 *
 *  - Step budget. A model that keeps calling tools can burn an operator's
 *    quota indefinitely. MAX_STEPS ends the turn and the transcript says the
 *    assistant stopped calling tools, rather than pretending it finished.
 *  - Write confirmation. Every write-class tool asks before it runs. A refusal
 *    is reported to the model truthfully ("the operator declined"), so it does
 *    not retry in a loop or claim success.
 */
import { type ChatTurn, type OutboundTool, streamChat } from '@/features/assistant/provider'
import type {
  AssistantMessage,
  AssistantProvider,
  AssistantToolSpec,
} from '@/features/assistant/types'

/** Tool-calling rounds per user turn before the runtime stops asking. */
const MAX_STEPS = 8

export interface ConfirmRequest {
  tool: AssistantToolSpec
  args: Record<string, unknown>
}

export interface TurnCallbacks {
  /** Called with each prose fragment so the UI can stream. */
  onDelta: (text: string) => void
  /**
   * Asks a human to approve a write-class call and resolves true/false.
   * Must not resolve without an explicit answer: a silent default here is
   * how an unattended write happens.
   */
  confirm: (req: ConfirmRequest) => Promise<boolean>
}

/** Result of running a turn. */
export interface TurnResult {
  /** Final assistant prose (after any tool rounds). */
  text: string
  /** True when the step budget was exhausted and tool calling was cut off. */
  truncated: boolean
  /** Messages to append to the transcript (assistant + tool rounds). */
  messages: AssistantMessage[]
}

function outbound(tools: AssistantToolSpec[]): OutboundTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.schema },
  }))
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    // A model that emits malformed JSON gets an error it can read, not a throw
    // that kills the turn.
    return {}
  }
}

/**
 * runTurn executes one user turn against the provider, executing tool calls as
 * the model asks for them.
 *
 * `tools` must already be the authorization-filtered set (see
 * assistantTools(allowWrite)); this function will not introduce a tool the
 * caller did not hand it. It still refuses to run a write-class tool without
 * going through cb.confirm, so a mis-wired caller degrades to "asks every time"
 * rather than "writes silently".
 */
export async function runTurn(
  provider: AssistantProvider,
  history: AssistantMessage[],
  tools: AssistantToolSpec[],
  cb: TurnCallbacks,
  signal: AbortSignal,
): Promise<TurnResult> {
  const appended: AssistantMessage[] = []
  // The provider sees the transcript we were given plus everything this turn
  // appended; `appended` is what the UI keeps.
  const working: AssistantMessage[] = [...history]
  const defs = outbound(tools)

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) break

    let turn: ChatTurn
    try {
      turn = await streamChat(provider, working, defs, cb.onDelta, signal)
    } catch (err) {
      if (signal.aborted) break
      throw err
    }

    const assistantMsg: AssistantMessage = {
      role: 'assistant',
      content: turn.content,
      ...(turn.toolCalls.length > 0 ? { toolCalls: turn.toolCalls } : {}),
    }
    appended.push(assistantMsg)
    working.push(assistantMsg)

    if (turn.toolCalls.length === 0) {
      return { text: turn.content, truncated: false, messages: appended }
    }

    for (const call of turn.toolCalls) {
      const spec = tools.find((t) => t.name === call.name)
      const args = parseArgs(call.arguments)

      let result: { content: string; failed?: boolean; toolError?: string }
      if (!spec) {
        result = {
          content: `unknown tool ${call.name}`,
          failed: true,
          toolError: `unknown tool ${call.name}`,
        }
      } else if (spec.toolClass === 'write') {
        const approved = await cb.confirm({ tool: spec, args })
        if (!approved) {
          // Report the refusal in the operator's terms so the model cannot
          // paraphrase it into success.
          result = {
            content: JSON.stringify({ refused: true, reason: 'the operator declined this write' }),
            failed: true,
            toolError: 'the operator declined this write',
          }
        } else {
          result = await spec.execute(args)
        }
      } else {
        result = await spec.execute(args)
      }

      const toolMsg: AssistantMessage = {
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        content: result.content,
        ...(result.toolError ? { toolError: result.toolError } : {}),
      }
      appended.push(toolMsg)
      working.push(toolMsg)
    }
  }

  return {
    text: '',
    truncated: true,
    messages: appended,
  }
}
