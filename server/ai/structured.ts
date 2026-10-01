// One-shot "give me JSON matching this schema" call used by the consistency check, meeting notes and
// question finder: native structured output on the Claude API, a submit tool behind proxies (9router).
import { config } from '../config.ts'
import { HttpError } from '../http.ts'
import { resolveEffort, toolsFor } from './common.ts'
import { SUBMIT_TOOL, parseJsonObject } from './extract.ts'
import { cutOffMessage, runModel, type Attachment, type Effort } from './llm/index.ts'
import { callMcpTool } from './mcp.ts'
import { activeModel, type ModelInfo } from './models.ts'

interface StructuredRequest {
  system: string[]
  task: string
  schema: Record<string, unknown>
  /** What the result is, for the submit tool's description. */
  resultName: string
  attachments?: (model: ModelInfo) => Promise<Attachment[]>
  /** Allow MCP documentation tools (e.g. Cekat docs) while working. */
  useDocTools?: boolean
  effortFallback?: Effort
  maxTokens?: number
  onProgress?: (chars: number) => void
  onToolUse?: (name: string, input: unknown) => void
}

export async function runStructured(req: StructuredRequest): Promise<{ data: Record<string, unknown>; model: ModelInfo }> {
  const model = await activeModel()
  if (config.anthropic.proxied && !model.tools) {
    throw new HttpError(400, `${model.id} cannot call tools, so it can't return structured results — pick another model in Settings → AI model.`)
  }
  const structured = !config.anthropic.proxied
  const [tools, effort, attachments] = await Promise.all([
    req.useDocTools ? toolsFor(model) : [],
    resolveEffort(model, req.effortFallback ?? config.anthropic.generateEffort),
    req.attachments ? req.attachments(model) : [],
  ])

  const result = await runModel({
    model,
    system: req.system,
    turns: [{ role: 'user', content: structured ? req.task : `${req.task}\n\nReturn the result ONLY by calling the ${SUBMIT_TOOL} tool once.` }],
    attachments,
    tools,
    runTool: callMcpTool,
    ...(structured
      ? { jsonSchema: req.schema }
      : { stopTool: { name: SUBMIT_TOOL, description: `Submit the ${req.resultName}.`, inputSchema: req.schema } }),
    effort,
    maxTokens: req.maxTokens ?? 32000,
    onProgress: req.onProgress,
    onToolUse: req.onToolUse,
  })
  if (result.stopReason === 'refusal') throw new HttpError(422, 'The model declined this request.')
  if (result.stopReason === 'max_tokens') throw new HttpError(502, cutOffMessage(`The ${req.resultName}`, req.maxTokens ?? 32000, model.maxOutput))
  const data = result.stopInput ?? parseJsonObject(result.text)
  if (!data) throw new HttpError(502, `The model did not return the ${req.resultName} — try again or pick another model.`)
  return { data, model }
}

// Small JSON-schema builders (closed objects, every key required — what structured outputs expect).
export const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) })
export const arr = (items: Record<string, unknown>, description?: string) => ({ type: 'array', items, ...(description ? { description } : {}) })
export const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})
