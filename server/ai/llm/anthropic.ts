// Anthropic Messages API adapter (direct Claude API, or Claude models behind 9router).
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../../config.ts'
import { MAX_TOOL_ROUNDS, TooManyToolRounds, resolveToolName, type Attachment, type RunRequest, type RunResult } from './types.ts'

type Msg = Anthropic.Beta.BetaMessageParam
type Block = Anthropic.Beta.BetaContentBlockParam

export const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey ?? null, baseURL: config.anthropic.baseURL })

// Server-side refusal fallback (Claude API only): rerun on a fallback model if the primary declines.
const FALLBACK = config.anthropic.proxied ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }

function attachmentBlocks(attachments: Attachment[]): Block[] {
  return attachments.flatMap((a): Block[] =>
    a.kind === 'pdf'
      ? [{ type: 'document', title: a.name, source: { type: 'base64', media_type: 'application/pdf', data: a.data } }]
      : [
          { type: 'image', source: { type: 'base64', media_type: a.mediaType as 'image/png', data: a.data } },
          { type: 'text', text: `(image above: ${a.name})` },
        ],
  )
}

function toMessages(req: RunRequest): Msg[] {
  const messages: Msg[] = req.turns.map((t) => ({ role: t.role, content: t.content }))
  const first = messages.findIndex((m) => m.role === 'user')
  if (first >= 0 && req.attachments.length) {
    messages[first] = { role: 'user', content: [...attachmentBlocks(req.attachments), { type: 'text', text: req.turns[first].content }] }
  }
  return messages
}

function systemBlocks(system: string[]): Anthropic.Beta.BetaTextBlockParam[] {
  // The last block is the large, stable project context — cache it.
  return system.map((text, i) => (i === system.length - 1 ? { type: 'text', text, cache_control: { type: 'ephemeral' } } : { type: 'text', text }))
}

export async function runAnthropic(req: RunRequest): Promise<RunResult> {
  const { model } = req
  const messages = toMessages(req)
  const tools = [...req.tools, ...(req.stopTool ? [req.stopTool] : [])]
  const outputConfig = {
    ...(req.effort ? { effort: req.effort } : {}),
    ...(req.jsonSchema ? { format: { type: 'json_schema' as const, schema: req.jsonSchema } } : {}),
  }

  let text = ''
  let chars = 0
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = anthropic.beta.messages.stream({
      model: model.id,
      max_tokens: model.maxOutput ? Math.min(req.maxTokens, model.maxOutput) : req.maxTokens,
      ...FALLBACK,
      ...(model.adaptiveThinking ? { thinking: { type: 'adaptive' as const } } : {}),
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      ...(tools.length
        ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema })) }
        : {}),
      system: systemBlocks(req.system),
      messages,
    })

    for await (const event of stream) {
      if (event.type !== 'content_block_delta') continue
      if (event.delta.type === 'text_delta') {
        text += event.delta.text
        req.onText?.(event.delta.text)
        chars += event.delta.text.length
      } else if (event.delta.type === 'input_json_delta') {
        chars += event.delta.partial_json.length
      } else continue
      req.onProgress?.(chars)
    }
    const final = await stream.finalMessage()
    const toolUses = final.content.filter((b) => b.type === 'tool_use')

    if (req.stopTool) {
      const stop = toolUses.find((b) => resolveToolName(b.name, [req.stopTool!]))
      if (stop) return { text, stopInput: stop.input as Record<string, unknown>, stopReason: 'tool_use' }
    }
    if (final.stop_reason !== 'tool_use' || !toolUses.length) return { text, stopInput: null, stopReason: final.stop_reason ?? 'end_turn' }

    messages.push({ role: 'assistant', content: final.content as Block[] })
    const results: Block[] = []
    for (const use of toolUses) {
      const def = resolveToolName(use.name, req.tools)
      req.onToolUse?.(def?.name ?? use.name, use.input)
      const output = def ? await req.runTool(def.name, use.input) : `Unknown tool "${use.name}"`
      results.push({ type: 'tool_result', tool_use_id: use.id, content: output })
    }
    messages.push({ role: 'user', content: results })
  }
  throw new TooManyToolRounds()
}
