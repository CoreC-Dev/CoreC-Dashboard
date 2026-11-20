/**
 * features/assistant/types.ts — the assistant's own vocabulary.
 *
 * AssistantMessage/ToolCall/ToolResult are re-exported from types/assistant.ts
 * so a feature never reaches into types/ by two different names.
 */
import type { ToolResult } from '@/types/assistant'

export type { AssistantMessage, AssistantProvider, ToolCall, ToolResult } from '@/types/assistant'

/** 'read': no state change on the device or config; 'write': needs human confirmation (enforced by runtime). */
export type ToolClass = 'read' | 'write'

export interface AssistantToolSpec {
  /** Same name as CoreC's MCP tool (`list_drivers`, `write_tag`, …). */
  name: string
  /** Sentence handed to the model verbatim as the tool description. */
  description: string
  /** JSON Schema for the arguments object. */
  schema: Record<string, unknown>
  /** Read/write classification; runtime requires confirmation for 'write'. */
  toolClass: ToolClass
  /** Executes the call. Throws on failure; the caller turns it into a toolError. */
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}
