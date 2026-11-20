/**
 * types/assistant.ts — the instance-scoped AI assistant's data model.
 *
 * Provider 设置（含 apiKey）存 localStorage，设置 UI 须明示披露。
 * 实例元数据存 localStorage，实例密钥默认存 sessionStorage（仅显式勾选记住时写 localStorage）。
 */

/** A provider the user can point the assistant at. */
export interface AssistantProvider {
  /** Display name; unique enough to identify the record in the settings UI. */
  name: string
  /**
   * OpenAI-compatible base URL WITHOUT the trailing /chat/completions, e.g.
   * "http://10.0.0.7:8000/v1" (vLLM) or "https://api.example.com/v1".
   */
  baseUrl: string
  model: string
  /**
   * Bearer key. Optional: local gateways (vLLM without --api-key) do not
   * authenticate. Stored in localStorage（provider 设置）— the settings UI
   * must disclose this.
   */
  apiKey?: string
  /** Extra headers for gateways that need them (e.g. X-Org-Id). */
  headers?: Record<string, string>
  /** Per-request timeout in ms; the streaming body is not capped by this. */
  timeoutMs?: number
}

/** One message in the conversation, provider-agnostic. */
export interface AssistantMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Present on assistant messages that requested tools. */
  toolCalls?: ToolCall[]
  /** Present on tool messages answering a ToolCall. */
  toolCallId?: string
  /** Present on tool messages: which tool produced this content. */
  toolName?: string
  /**
   * Present on tool messages: the engine's own words (error text / status),
   * kept apart from `content` so the UI can render a refusal as a refusal
   * instead of a paraphrase. Empty on success.
   */
  toolError?: string
}

/** A tool invocation requested by the model. */
export interface ToolCall {
  id: string
  name: string
  /** Raw JSON arguments string as the provider sent them. */
  arguments: string
}

/** Result of executing one tool. */
export interface ToolResult {
  /** JSON text handed back to the model as the tool message content. */
  content: string
  /** True when the call failed or was refused; surfaced in the transcript. */
  failed?: boolean
  /**
   * The engine's own reason text when the call failed (e.g. "tag \"sp\" is
   * read-only (protect: read-only)"). Carried apart from content so the UI can
   * show a refusal as a refusal instead of a model paraphrase.
   */
  toolError?: string
  /**
   * One-line human summary for the transcript card (e.g. "drivers: 3").
   * Never the full payload: large responses are summarised, not dumped.
   */
  summary?: string
}
