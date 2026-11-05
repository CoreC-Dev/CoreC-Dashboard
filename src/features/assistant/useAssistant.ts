/**
 * features/assistant/useAssistant.ts - the chat box's state machine.
 *
 * Kept out of the component so the transcript rules (what a refusal looks
 * like, what truncation means) live in one testable place rather than inside
 * JSX. The component renders this state; it never decides whether a call was
 * allowed.
 */
import { useCallback, useRef, useState } from 'react'
import { runTurn } from '@/features/assistant/runtime'
import { assistantTools } from '@/features/assistant/tools'
import type { AssistantMessage, AssistantProvider } from '@/types/assistant'

export interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
  /** Tool calls that ran during this assistant turn, for the card list. */
  tools?: { name: string; summary: string; failed: boolean }[]
  /** Set when the step budget cut tool calling off. */
  truncated?: boolean
}

export interface PendingConfirm {
  toolName: string
  args: Record<string, unknown>
  description: string
}

interface AssistantState {
  entries: TranscriptEntry[]
  streaming: boolean
  draft: string
  error: string | null
  pending: PendingConfirm | null
}

const EMPTY: AssistantState = {
  entries: [],
  streaming: false,
  draft: '',
  error: null,
  pending: null,
}

export function useAssistant(provider: AssistantProvider | null, allowWrite: boolean) {
  const [state, setState] = useState<AssistantState>(EMPTY)
  const abortRef = useRef<AbortController | null>(null)
  // The provider transcript accumulates across turns; a ref keeps it out of
  // the render path and lets send/stop stay stable callbacks.
  const historyRef = useRef<AssistantMessage[]>([])
  const resolveConfirm = useRef<((ok: boolean) => void) | null>(null)

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !provider || state.streaming) return

      const userEntry: TranscriptEntry = { role: 'user', text: trimmed }
      setState((s) => ({
        ...s,
        entries: [...s.entries, userEntry],
        streaming: true,
        draft: '',
        error: null,
      }))
      historyRef.current = [...historyRef.current, { role: 'user', content: trimmed }]

      const ctrl = new AbortController()
      abortRef.current = ctrl
      let assistantText = ''

      try {
        const tools = assistantTools(allowWrite)
        const turn = await runTurn(
          provider,
          historyRef.current,
          tools,
          {
            onDelta: (delta) => {
              assistantText += delta
              setState((s) => ({ ...s, draft: assistantText }))
            },
            confirm: (req) =>
              new Promise<boolean>((resolve) => {
                resolveConfirm.current = resolve
                setState((s) => ({
                  ...s,
                  pending: {
                    toolName: req.tool.name,
                    args: req.args,
                    description: req.tool.description,
                  },
                }))
              }),
          },
          ctrl.signal,
        )

        // Carry the turn's messages forward so the next turn is conversational.
        for (const m of turn.messages) historyRef.current.push(m)

        // One card per tool round; the payload itself stays with the model.
        const cards = turn.messages
          .filter((m) => m.role === 'tool')
          .map((m) => ({
            name: m.toolName ?? 'tool',
            summary: m.toolError ?? summarizePayload(m.content),
            failed: Boolean(m.toolError),
          }))

        setState((s) => ({
          entries: [
            ...s.entries,
            {
              role: 'assistant',
              text: assistantText,
              ...(cards.length > 0 ? { tools: cards } : {}),
              ...(turn.truncated ? { truncated: true } : {}),
            },
          ],
          streaming: false,
          draft: '',
          error: null,
          pending: null,
        }))
      } catch (err) {
        if (ctrl.signal.aborted) {
          setState((s) => ({ ...s, streaming: false, draft: '', pending: null }))
        } else {
          setState((s) => ({
            ...s,
            streaming: false,
            draft: '',
            pending: null,
            error: err instanceof Error ? err.message : String(err),
          }))
        }
      } finally {
        abortRef.current = null
      }
    },
    [provider, allowWrite, state.streaming],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const answerConfirm = useCallback((ok: boolean) => {
    resolveConfirm.current?.(ok)
    resolveConfirm.current = null
    setState((s) => ({ ...s, pending: null }))
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    historyRef.current = []
    setState(EMPTY)
  }, [])

  return { ...state, send, stop, answerConfirm, reset }
}

/**
 * summarizePayload produces the one-line card text for a tool answer. It is
 * intentionally lossy: the card is an index into the transcript, and the model
 * already holds the full payload.
 */
function summarizePayload(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length <= 120 ? flat : `${flat.slice(0, 117)}...`
}
