// OpenAI Chat Completions adapter — how 9router speaks to non-Claude providers (OpenCode, GitHub, Gemini, …).
import OpenAI from 'openai'
import type { ChatCompletionContentPart, ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { config } from '../../config.ts'
import { MAX_TOOL_ROUNDS, TooManyToolRounds, resolveToolName, type RunRequest, type RunResult } from './types.ts'

const client = config.anthropic.baseURL
  ? new OpenAI({ apiKey: config.anthropic.apiKey ?? 'none', baseURL: `${config.anthropic.baseURL.replace(/\/+$/, '')}/v1` })
  : null

function toMessages(req: RunRequest): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: req.system.join('\n\n') }]
  // Chat Completions has no portable PDF input; images go as data URLs.
  const images = req.attachments.filter((a) => a.kind === 'image')
  let attached = false
  for (const t of req.turns) {
    if (t.role === 'user' && !attached && images.length) {
      attached = true
      const parts: ChatCompletionContentPart[] = images.map((a) => ({ type: 'image_url', image_url: { url: `data:${a.mediaType};base64,${a.data}` } }))
      messages.push({ role: 'user', content: [...parts, { type: 'text', text: t.content }] })
    } else {
      messages.push({ role: t.role, content: t.content })
    }
  }
  return messages
}

interface PendingCall {
  id: string
  name: string
  args: string
}

function parseArgs(args: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(args || '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function runOpenAI(req: RunRequest): Promise<RunResult> {
  if (!client) throw new Error('Non-Claude models need ANTHROPIC_BASE_URL (9router) in .env')
  const { model } = req
  const messages = toMessages(req)
  const defs = [...req.tools, ...(req.stopTool ? [req.stopTool] : [])]
  const tools: ChatCompletionTool[] = defs.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))

  let text = ''
  let chars = 0
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.chat.completions.create({
      model: model.id,
      messages,
      stream: true,
      ...(model.maxOutput ? { max_tokens: Math.min(req.maxTokens, model.maxOutput) } : {}),
      ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}),
      ...(req.effort ? { reasoning_effort: req.effort } : {}),
    })

    let content = ''
    let finish = ''
    const calls: PendingCall[] = []
    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue
      if (choice.finish_reason) finish = choice.finish_reason
      const delta = choice.delta
      if (delta?.content) {
        content += delta.content
        text += delta.content
        req.onText?.(delta.content)
        chars += delta.content.length
        req.onProgress?.(chars)
      }
      for (const tc of delta?.tool_calls ?? []) {
        const call = (calls[tc.index] ??= { id: '', name: '', args: '' })
        if (tc.id) call.id = tc.id
        if (tc.function?.name) call.name += tc.function.name
        if (tc.function?.arguments) {
          call.args += tc.function.arguments
          chars += tc.function.arguments.length
          req.onProgress?.(chars)
        }
      }
    }

    const done = calls.filter(Boolean)
    if (req.stopTool) {
      const stop = done.find((c) => resolveToolName(c.name, [req.stopTool!]))
      if (stop) return { text, stopInput: parseArgs(stop.args), stopReason: 'tool_use' }
    }
    if (!done.length) return { text, stopInput: null, stopReason: finish === 'length' ? 'max_tokens' : finish || 'stop' }

    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: done.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } })),
    })
    for (const call of done) {
      const def = resolveToolName(call.name, req.tools)
      const input = parseArgs(call.args)
      req.onToolUse?.(def?.name ?? call.name, input)
      const output = !def ? `Unknown tool "${call.name}"` : input ? await req.runTool(def.name, input) : 'Invalid JSON arguments'
      messages.push({ role: 'tool', tool_call_id: call.id, content: output })
    }
  }
  throw new TooManyToolRounds()
}
