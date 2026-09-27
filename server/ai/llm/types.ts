// Provider-neutral request/response shapes. Adapters (anthropic.ts, openai.ts) translate these to each wire format
// and run the tool loop: call model → run requested tools → feed results back → repeat until it answers.
import type { ModelInfo } from '../models.ts'

export type Effort = 'low' | 'medium' | 'high'

export interface Attachment {
  kind: 'image' | 'pdf'
  mediaType: string
  data: string // base64
  name: string
}

export interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export interface RunRequest {
  model: ModelInfo
  /** System prompt blocks; the last one is the large, stable project context (cached where supported). */
  system: string[]
  turns: Turn[]
  /** Sent natively with the first user turn. Callers pass only what the model can read. */
  attachments: Attachment[]
  /** Tools the model may call any number of times (e.g. MCP documentation search). */
  tools: ToolDef[]
  runTool: (name: string, input: unknown) => Promise<string>
  /** Calling this tool ends the run; its input is the result (used to return structured documents). */
  stopTool?: ToolDef
  /** Native structured output (direct Claude API only). */
  jsonSchema?: Record<string, unknown>
  effort?: Effort
  maxTokens: number
  onText?: (text: string) => void
  onProgress?: (chars: number) => void
  onToolUse?: (name: string, input: unknown) => void
}

export interface RunResult {
  text: string
  stopInput: Record<string, unknown> | null
  stopReason: string
}

export const MAX_TOOL_ROUNDS = 8

/**
 * Proxies can rename tools on the way back (9router returns `submit_document` as `submit_document_ide`),
 * so match exactly first, then by the longest defined name the returned name starts with.
 */
export function resolveToolName<T extends { name: string }>(returned: string, defs: T[]): T | undefined {
  const exact = defs.find((d) => d.name === returned)
  if (exact) return exact
  return defs
    .filter((d) => returned.startsWith(d.name))
    .sort((a, b) => b.name.length - a.name.length)[0]
}

export class TooManyToolRounds extends Error {
  constructor() {
    super(`The model kept calling tools for ${MAX_TOOL_ROUNDS} rounds without answering — try a more specific request.`)
  }
}
