/**
 * features/assistant/types.ts — the assistant's own vocabulary.
 *
 * AssistantMessage/ToolCall/ToolResult are re-exported from types/assistant.ts
 * so a feature never reaches into types/ by two different names.
 */
import type { ToolResult } from '@/types/assistant'

export type { AssistantMessage, AssistantProvider, ToolCall, ToolResult } from '@/types/assistant'

/** Read-class tool: no state change on the device or the config. */
/** Write-class tool: changes the device (write/pause/resume/ack). */
export type ToolClass = 'read' | 'write'

/** One tool the assistant may invoke. */
export interface AssistantToolSpec {
  /** Same name as CoreC's MCP tool (`list_drivers`, `write_tag`, …). */
  name: string
  /** Sentence handed to the model verbatim as the tool description. */
  description: string
  /** JSON Schema for the arguments object. */
  schema: Record<string, unknown>
  /** Whether the call needs human confirmation before it runs. */
  toolClass: ToolClass
  /** Executes the call. Throws on failure; the caller turns it into a toolError. */
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}
