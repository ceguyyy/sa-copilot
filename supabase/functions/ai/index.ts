// AI edge function: `chat` (streamed conversation) and `generate` (structured document output).
// Both stream NDJSON lines to the browser: {type:"delta"|"done"|"error", ...}.

import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2'
import { corsHeaders } from '../_shared/cors.ts'
import { HttpError, loadAttachmentBlocks, loadProjectContext, renderContextText } from '../_shared/context.ts'
import { DOC_LABELS, DOC_SCHEMAS, isDocType, validateContent, type DocType } from '../_shared/schemas.ts'

const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5'
const CHAT_EFFORT = (Deno.env.get('CHAT_EFFORT') ?? 'medium') as 'low' | 'medium' | 'high'
const GENERATE_EFFORT = (Deno.env.get('GENERATE_EFFORT') ?? 'high') as 'low' | 'medium' | 'high'
const HISTORY_LIMIT = 40
const MAX_INSTRUCTION_CHARS = 8000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Server-side refusal fallback (Claude API only): rerun on a fallback model if the primary declines.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }

const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY

const BASE_SYSTEM = `You are the personal Solution Architect copilot of a presales Solution Architect at PT Teknologi Cekat Indonesia (Cekat AI) — an AI Agent builder and Omnichannel CRM (WhatsApp, Instagram, Facebook, Live Chat, marketplace).
You help turn client requirements into: Assessment Requirement, TOR, Timeline, SOW (Cekat internal format and Meta CIF format), Onboarding Forms, and UML/flow diagrams in Mermaid.
Rules:
- Ground every statement in the provided requirements and knowledge. When information is missing, say so explicitly and mark it as needing client confirmation instead of inventing numbers, prices, vendors or dates.
- Default language is Bahasa Indonesia unless the requirement or the user uses English.
- Be concrete and professional, like an experienced presales SA.`

type Stream = { send: (obj: unknown) => void }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const db = userClient(req)
    const { data: auth, error: authErr } = await db.auth.getUser()
    if (authErr || !auth.user) throw new HttpError(401, 'Unauthorized')

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')
    if (typeof body.projectId !== 'string' || !UUID_RE.test(body.projectId)) throw new HttpError(400, 'Invalid projectId')

    if (body.action === 'chat') return streamResponse((s) => handleChat(db, body, s))
    if (body.action === 'generate') return streamResponse((s) => handleGenerate(db, body, s))
    throw new HttpError(400, 'Unknown action')
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status === 500) console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, status)
  }
})

// ---------------- chat ----------------

async function handleChat(db: SupabaseClient, body: Record<string, unknown>, out: Stream) {
  const projectId = body.projectId as string
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > MAX_INSTRUCTION_CHARS) throw new HttpError(400, 'Message is empty or too long')

  const ctx = await loadProjectContext(db, projectId)
  const skill = await loadSkill(db, body.skillId, 'chat')

  const { error: insErr } = await db.from('messages').insert({ project_id: projectId, role: 'user', content: message })
  if (insErr) throw new HttpError(500, `Failed to save message: ${insErr.message}`)

  const { data: history, error: hErr } = await db
    .from('messages')
    .select('role, content')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  if (hErr) throw new HttpError(500, `Failed to load history: ${hErr.message}`)

  const turns: Anthropic.Beta.BetaMessageParam[] = (history ?? [])
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))
  while (turns.length && turns[0].role !== 'user') turns.shift()

  const attachments = await loadAttachmentBlocks(db, ctx)
  if (attachments.length && turns.length) {
    turns[0] = { role: 'user', content: [...attachments, { type: 'text', text: turns[0].content as string }] }
  }

  const stream = anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    ...FALLBACK,
    thinking: { type: 'adaptive' },
    output_config: { effort: CHAT_EFFORT },
    system: systemBlocks(skill?.instructions, renderContextText(ctx)),
    messages: turns,
  })

  let text = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text
      out.send({ type: 'delta', text: event.delta.text })
    }
  }
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') throw new HttpError(422, 'Claude declined this request.')

  const reply = text.trim() || '(no response)'
  const { error: saveErr } = await db.from('messages').insert({ project_id: projectId, role: 'assistant', content: reply })
  if (saveErr) console.error('Failed to save assistant message:', saveErr.message)
  out.send({ type: 'done', stop_reason: final.stop_reason })
}

// ---------------- generate ----------------

async function handleGenerate(db: SupabaseClient, body: Record<string, unknown>, out: Stream) {
  const projectId = body.projectId as string
  const docType = body.docType
  if (!isDocType(docType)) throw new HttpError(400, 'Invalid docType')
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : ''
  const documentId = typeof body.documentId === 'string' && UUID_RE.test(body.documentId) ? body.documentId : null
  const diagramKind = typeof body.diagramKind === 'string' ? body.diagramKind : ''

  const ctx = await loadProjectContext(db, projectId)
  const skill = await loadSkill(db, body.skillId, docType)
  const existing = documentId ? ctx.docs.find((d) => d.id === documentId) : ctx.docs.find((d) => d.type === docType && docType !== 'diagram')

  const task = buildTask(docType, instruction, existing, diagramKind)
  const attachments = await loadAttachmentBlocks(db, ctx)

  const stream = anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    ...FALLBACK,
    thinking: { type: 'adaptive' },
    output_config: { effort: GENERATE_EFFORT, format: { type: 'json_schema', schema: DOC_SCHEMAS[docType] } },
    system: systemBlocks(skill?.instructions, renderContextText(ctx)),
    messages: [{ role: 'user', content: [...attachments, { type: 'text', text: task }] }],
  })

  let chars = 0
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      chars += event.delta.text.length
      out.send({ type: 'progress', chars })
    }
  }
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') throw new HttpError(422, 'Claude declined this request.')
  if (final.stop_reason === 'max_tokens') throw new HttpError(502, 'Output was cut off (max_tokens). Try a narrower instruction.')

  const raw = final.content.find((b) => b.type === 'text')
  if (!raw || raw.type !== 'text') throw new HttpError(502, 'Model returned no content')
  let content: Record<string, unknown>
  try {
    content = JSON.parse(raw.text)
  } catch {
    throw new HttpError(502, 'Model returned invalid JSON')
  }
  const invalid = validateContent(docType, content)
  if (invalid) throw new HttpError(502, `Model output failed validation: ${invalid}`)

  // The start date is owned by the user; never let a regeneration wipe it.
  if (docType === 'timeline' && !content.start_date && existing) {
    content = { ...content, start_date: (existing.content as { start_date?: string }).start_date ?? '' }
  }

  const docId = existing?.id ?? (await createDocument(db, projectId, docType, content))
  const { data: version, error: vErr } = await db
    .from('document_versions')
    .insert({
      document_id: docId,
      content,
      origin: 'ai',
      skill_id: skill?.id ?? null,
      note: instruction ? `AI: ${instruction.slice(0, 200)}` : existing ? 'AI regenerate' : 'AI initial draft',
    })
    .select('id, version_no')
    .single()
  if (vErr) throw new HttpError(500, `Failed to save version: ${vErr.message}`)

  out.send({ type: 'done', documentId: docId, versionId: version.id, versionNo: version.version_no })
}

function buildTask(
  docType: DocType,
  instruction: string,
  existing: { id: string; version: number } | undefined,
  diagramKind: string,
): string {
  const lines = [`Task: produce the "${DOC_LABELS[docType]}" document for this project as JSON matching the schema.`]
  if (docType === 'diagram' && diagramKind) lines.push(`Diagram kind: ${diagramKind}. Use the matching Mermaid diagram syntax.`)
  if (existing) {
    lines.push(
      `A current version exists (<document id="${existing.id}"> v${existing.version} in the context). Revise it: apply the instruction, keep everything the instruction does not ask to change.`,
    )
  }
  if (docType === 'sow_cekat' || docType === 'sow_cif') {
    lines.push('Durations and milestones MUST come from the Timeline document in the context (its SLA/Days are the mandays set by the SA). If no timeline exists, write "TBD — timeline belum dibuat".')
  }
  lines.push(instruction ? `Instruction from the SA: ${instruction}` : 'No extra instruction — follow the skill guidance.')
  return lines.join('\n')
}

// ---------------- helpers ----------------

function systemBlocks(skillInstructions: string | undefined, contextText: string): Anthropic.Beta.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: BASE_SYSTEM }]
  if (skillInstructions) blocks.push({ type: 'text', text: `# SKILL INSTRUCTIONS\n${skillInstructions}` })
  // Context is the large, stable part — cache it.
  blocks.push({ type: 'text', text: contextText, cache_control: { type: 'ephemeral' } })
  return blocks
}

async function loadSkill(db: SupabaseClient, skillId: unknown, outputType: string) {
  let query = db.from('skills').select('id, instructions').eq('output_type', outputType)
  if (typeof skillId === 'string' && UUID_RE.test(skillId)) query = query.eq('id', skillId)
  else query = query.order('is_default', { ascending: false }).order('updated_at', { ascending: false })
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw new HttpError(500, `Failed to load skill: ${error.message}`)
  return data as { id: string; instructions: string } | null
}

async function createDocument(db: SupabaseClient, projectId: string, type: DocType, content: Record<string, unknown>) {
  const title = type === 'diagram' && typeof content.title === 'string' && content.title ? content.title : DOC_LABELS[type]
  const { data, error } = await db.from('documents').insert({ project_id: projectId, type, title }).select('id').single()
  if (error) throw new HttpError(500, `Failed to create document: ${error.message}`)
  return data.id as string
}

function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new HttpError(401, 'Missing Authorization header')
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
}

function streamResponse(run: (s: Stream) => Promise<void>): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        await run({ send })
      } catch (e) {
        console.error(e)
        send({ type: 'error', error: describeError(e) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson' } })
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError) return 'Claude rate limit reached — try again in a minute.'
  if (e instanceof Anthropic.AuthenticationError) return 'ANTHROPIC_API_KEY is invalid or missing on the server.'
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ''}: ${e.message}`
  if (e instanceof Error) return e.message
  return 'Unexpected error'
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
