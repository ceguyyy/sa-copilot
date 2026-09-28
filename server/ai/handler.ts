// AI endpoints: `chat` (streamed conversation) and `generate` (structured document), plus model/effort settings.
// Responses stream NDJSON lines: {type:"delta"|"progress"|"tool"|"done"|"error", ...}.

import { Hono, type Context } from 'hono'
import { DOC_LABELS, DOC_SCHEMAS, isDocType, validateContent, type DocType } from '../../shared/schemas.ts'
import { attachmentIds, ownerFiles, requestFiles, type LoadedFiles } from '../attachments.ts'
import { config } from '../config.ts'
import { query, queryOne } from '../db.ts'
import { exportDocumentFiles } from '../exports.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { assist } from './assist.ts'
import { splitDiagram } from './split.ts'
import { summarizeAudit } from './auditSummary.ts'
import { checkConsistency } from './consistency.ts'
import { processMeetingNotes } from './meeting.ts'
import { findQuestions } from './questions.ts'
import { summarizeVersionDiff } from './versionDiff.ts'
import { generateDemoScenarios } from './demoScenarios.ts'
import { generatePocDraft } from './pocDraft.ts'
import { loadAttachments, loadProjectContext, renderContextText } from './context.ts'
import { SUBMIT_TOOL, parseJsonObject } from './extract.ts'
import { resolveEffort, systemPrompt, toolEvents, toolsFor } from './common.ts'
import { runModel, type ToolDef } from './llm/index.ts'
import { callMcpTool } from './mcp.ts'
import { activeModel, getEffort, listModels, selectModel, setEffort } from './models.ts'
import { streamResponse, type Stream } from './stream.ts'

const HISTORY_LIMIT = 40
const MAX_INSTRUCTION_CHARS = 8000

type Body = Record<string, unknown>

export const ai = new Hono()

ai.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body')
  if (typeof body.projectId !== 'string' || !UUID_RE.test(body.projectId)) throw new HttpError(400, 'Invalid projectId')
  requireApiKey()

  if (body.action === 'chat') return streamResponse((s) => handleChat(body, s))
  if (body.action === 'generate') return streamResponse((s) => handleGenerate(body, s))
  throw new HttpError(400, 'Unknown action')
})

/** Endpoints that validate their own JSON body and stream NDJSON back. */
const streamed = (run: (body: unknown, out: Stream) => Promise<void>) => async (c: Context) => {
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'Invalid JSON body')
  })
  requireApiKey()
  return streamResponse((s) => run(body, s))
}

ai.post('/assist', streamed(assist))
ai.post('/split-diagram', streamed(splitDiagram))
ai.post('/audit-summary', streamed(summarizeAudit))
ai.post('/consistency', streamed(checkConsistency))
ai.post('/meeting-notes', streamed(processMeetingNotes))
ai.post('/find-questions', streamed(findQuestions))
ai.post('/version-diff', streamed(summarizeVersionDiff))
ai.post('/demo-scenarios', streamed(generateDemoScenarios))
ai.post('/poc-draft', streamed(generatePocDraft))

ai.get('/models', async (c) => {
  const [models, selected, effort] = await Promise.all([listModels(), activeModel(), getEffort()])
  // A hand-typed model is not in 9router's list; show it anyway so the picker can display it.
  const all = models.some((m) => m.id === selected.id) ? models : [...models, selected]
  return c.json({ models: all, selected: selected.id, effort, proxied: config.anthropic.proxied })
})

ai.put('/model', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (typeof body?.model !== 'string' || !body.model.trim() || body.model.length > 200) throw new HttpError(400, 'Invalid model')
  return c.json(await selectModel(body.model.trim()))
})

ai.put('/effort', async (c) => {
  const body = await c.req.json().catch(() => null)
  return c.json({ effort: await setEffort(body?.effort) })
})

function requireApiKey() {
  if (!config.anthropic.apiKey) throw new HttpError(500, 'ANTHROPIC_API_KEY is not set in .env')
}

// ---------------- chat ----------------

async function handleChat(body: Body, out: Stream) {
  const projectId = body.projectId as string
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > MAX_INSTRUCTION_CHARS) throw new HttpError(400, 'Message is empty or too long')

  const model = await activeModel()
  const [ctx, skill, tools, effort, files] = await Promise.all([
    loadProjectContext(projectId),
    loadSkill(body.skillId, 'chat'),
    toolsFor(model),
    resolveEffort(model, config.anthropic.chatEffort),
    requestFiles(attachmentIds.parse(body.attachmentIds), model.vision),
  ])
  const skillFiles = await ownerFiles('skill', skill?.id, model.vision)

  // History keeps only the file names; the file contents go to the model with this turn.
  const saved = files.names.length ? `${message}\n\n📎 ${files.names.join(', ')}` : message
  await query(`insert into messages (project_id, role, content) values ($1, 'user', $2)`, [projectId, saved])
  const history = await query<{ role: 'user' | 'assistant'; content: string }>(
    'select role, content from messages where project_id = $1 order by created_at desc limit $2',
    [projectId, HISTORY_LIMIT],
  )
  const turns = history.reverse()
  while (turns.length && turns[0].role !== 'user') turns.shift()
  const last = turns.length - 1
  if (last >= 0 && files.text) turns[last] = { role: 'user', content: withFiles(message, files) }

  const result = await runModel({
    model,
    system: systemPrompt(
      [withFiles(skill?.instructions, skillFiles), focusNote(body.focus)].filter(Boolean).join('\n\n') || undefined,
      renderContextText(ctx),
    ),
    turns,
    attachments: [...(await loadAttachments(ctx, model)), ...skillFiles.images, ...files.images],
    tools,
    runTool: callMcpTool,
    effort,
    maxTokens: 32000,
    onText: (text) => out.send({ type: 'delta', text }),
    onToolUse: toolEvents(out),
  })
  if (result.stopReason === 'refusal') throw new HttpError(422, 'The model declined this request.')

  const reply = result.text.trim() || '(no response)'
  await query(`insert into messages (project_id, role, content) values ($1, 'assistant', $2)`, [projectId, reply]).catch((e) =>
    console.error('Failed to save assistant message:', e),
  )
  out.send({ type: 'done', stop_reason: result.stopReason })
}

// ---------------- generate ----------------

interface Template {
  id: string
  name: string
  instructions: string
}

async function handleGenerate(body: Body, out: Stream) {
  const projectId = body.projectId as string
  const docType = body.docType
  if (!isDocType(docType)) throw new HttpError(400, 'Invalid docType')
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : ''
  const documentId = typeof body.documentId === 'string' && UUID_RE.test(body.documentId) ? body.documentId : null
  const diagramKind = typeof body.diagramKind === 'string' ? body.diagramKind : ''

  const model = await activeModel()
  if (config.anthropic.proxied && !model.tools) {
    throw new HttpError(400, `${model.id} cannot call tools, so it can't write documents — pick another model (it still works for chat).`)
  }
  const [ctx, skill, tools, effort, files] = await Promise.all([
    loadProjectContext(projectId),
    loadSkill(body.skillId, docType),
    toolsFor(model),
    resolveEffort(model, config.anthropic.generateEffort),
    requestFiles(attachmentIds.parse(body.attachmentIds), model.vision),
  ])
  // Diagrams and custom deliverables can have many per project; the others are one-per-type.
  const existing = documentId
    ? ctx.docs.find((d) => d.id === documentId)
    : docType === 'diagram' || docType === 'custom'
      ? undefined
      : ctx.docs.find((d) => d.type === docType)
  const template = docType === 'custom' ? await loadTemplate(body.templateId, existing?.id) : null
  const [skillFiles, templateFiles] = await Promise.all([
    ownerFiles('skill', skill?.id, model.vision),
    ownerFiles('template', template?.id, model.vision),
  ])

  const schema = DOC_SCHEMAS[docType]
  const task = buildTask(docType, instruction, existing, diagramKind, template)
  const structured = !config.anthropic.proxied // native structured outputs only on the Claude API itself
  const stopTool: ToolDef = {
    name: SUBMIT_TOOL,
    description: `Submit the finished ${template?.name ?? DOC_LABELS[docType]} document.`,
    inputSchema: schema,
  }

  const result = await runModel({
    model,
    system: systemPrompt(
      withFiles(withFiles(joinInstructions(skill?.instructions, template), skillFiles), templateFiles),
      renderContextText(ctx),
    ),
    turns: [
      {
        role: 'user',
        content: withFiles(structured ? task : `${task}\nReturn the document ONLY by calling the ${SUBMIT_TOOL} tool exactly once.`, files),
      },
    ],
    attachments: [...(await loadAttachments(ctx, model)), ...skillFiles.images, ...templateFiles.images, ...files.images],
    tools,
    runTool: callMcpTool,
    ...(structured ? { jsonSchema: schema } : { stopTool }),
    effort,
    maxTokens: 64000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })
  if (result.stopReason === 'refusal') throw new HttpError(422, 'The model declined this request.')
  if (result.stopReason === 'max_tokens') throw new HttpError(502, 'Output was cut off (max_tokens). Try a narrower instruction.')

  let content = result.stopInput ?? parseJsonObject(result.text)
  if (!content) throw new HttpError(502, 'Model did not return the document as JSON — try again or pick another model.')
  const invalid = validateContent(docType, content)
  if (invalid) throw new HttpError(502, `Model output failed validation: ${invalid}`)

  // The start date is owned by the user; never let a regeneration wipe it.
  if (docType === 'timeline' && !content.start_date && existing) {
    content = { ...content, start_date: (existing.content as { start_date?: string }).start_date ?? '' }
  }

  const docId = existing?.id ?? (await createDocument(projectId, docType, content, template))
  const note = instruction ? `AI: ${instruction.slice(0, 200)}` : existing ? 'AI regenerate' : 'AI initial draft'
  const version = await queryOne<{ id: string; version_no: number }>(
    `insert into document_versions (document_id, content, origin, skill_id, note)
     values ($1, $2, 'ai', $3, $4) returning id, version_no`,
    [docId, content, skill?.id ?? null, `${note} · ${model.id}`],
  )
  exportDocumentFiles(docId).catch((e) => console.error('Auto-export failed:', e))

  out.send({ type: 'done', documentId: docId, versionId: version!.id, versionNo: version!.version_no })
}

function buildTask(
  docType: DocType,
  instruction: string,
  existing: { id: string; version: number } | undefined,
  diagramKind: string,
  template: Template | null,
): string {
  const label = template?.name ?? DOC_LABELS[docType]
  const lines = [`Task: produce the "${label}" document for this project as JSON matching the schema.`]
  if (docType === 'diagram' && diagramKind) lines.push(`Diagram kind: ${diagramKind}. Use the matching Mermaid diagram syntax.`)
  if (template) {
    lines.push(
      'It is a custom deliverable: put key facts (client, dates, version, owner…) in `meta` and the body in `sections`, each section markdown. Follow the template instructions for which sections to write.',
    )
  }
  if (existing) {
    lines.push(
      `A current version exists (<document id="${existing.id}"> v${existing.version} in the context). Revise it: apply the instruction, keep everything the instruction does not ask to change.`,
    )
  }
  if (docType === 'deck') {
    lines.push(
      'It is the pitch deck: write the content of template slides 31–40 for THIS client — end-to-end architecture, CRM data flow, marketing journey, three WhatsApp use-case mockups (realistic chat in the project language, fake names), CRM / kanban / analytics mockups with realistic sample data, and the timeline prerequisites. Tailor every slide to the requirements and the Cekat features that actually exist (check the docs). Keep each text short enough for a slide.',
    )
  }
  if (docType === 'user_journey') lines.push(USER_JOURNEY_TASK.replace('<today dd/mm/yyyy>', new Date().toLocaleDateString('en-GB')))
  if (docType === 'sow_cekat' || docType === 'sow_cif') {
    lines.push('Durations and milestones MUST come from the Timeline document in the context (its SLA/Days are the mandays set by the SA). If no timeline exists, write "TBD — timeline belum dibuat".')
  }
  lines.push(instruction ? `Instruction from the SA: ${instruction}` : 'No extra instruction — follow the skill guidance.')
  return lines.join('\n')
}

const USER_JOURNEY_TASK = [
  'It is the User Journey AI Agent Workflow in the Cekat "Template User Journey Workflows" format: the scripts (redaksional) the AI Agent will say, grouped into topic sheets.',
  'Sheets: one per flow-based topic or menu — e.g. "Greeting, Main Menu" (sections Greeting + Main Menu), one sheet per main use case from the requirements (e.g. booking, tracking, cek tagihan), and "Unknown, CSAT, Live Agent" (sections CSAT (Survey Satisfaction) and Human Agent Transfer). Add knowledge sheets (FAQ, Produk, Promo, Lokasi Cabang) only for content that is not served by an API. Sheet names ≤ 31 characters.',
  'Each script: no = number within the sheet; parent = "root" (session start, e.g. the greeting), "random" (reachable from any state, e.g. main menu, CSAT, live agent) or the parent script number; scenario; trigger = sample user input or condition, dynamic input in brackets e.g. "[no resi]"; response = the exact reply; note = API (GET/POST endpoint), validation rule, set label, routing team, connect agent…; revision = "added <today dd/mm/yyyy>".',
  'Tips from the template: give the AI Agent a persona name and greet the user by name; use emoticons; add an idle follow-up after 5 minutes of silence where it matters (Followup section); validate phone numbers, emails, bill/order numbers and IDs; add a reply for API errors wherever an API is hit; show buttons/lists as "[button] Label" / "[List Menu] Title"; write dynamic API data as [variable], e.g. [name user].',
  'Write every response in the project language.',
].join('\n')

/** Which part of the project the SA is looking at (the project page tab), so answers stay on topic. */
function focusNote(focus: unknown): string {
  return typeof focus === 'string' && focus.trim() ? `# CURRENT FOCUS\nThe SA is on the "${focus.trim().slice(0, 60)}" tab of the project — prioritise that area.` : ''
}

/** Appends attached files' text below a prompt part (instructions or a user turn). */
function withFiles<T extends string | undefined>(text: T, files: LoadedFiles): T | string {
  if (!files.text) return text
  return text ? `${text}\n\n${files.text}` : files.text
}

function joinInstructions(skill: string | undefined, template: Template | null): string | undefined {
  const parts = [skill, template && `# TEMPLATE: ${template.name}\n${template.instructions || '(no extra instructions)'}`].filter(Boolean)
  return parts.length ? parts.join('\n\n') : undefined
}

async function loadSkill(skillId: unknown, outputType: string) {
  if (typeof skillId === 'string' && UUID_RE.test(skillId)) {
    return queryOne<{ id: string; instructions: string }>('select id, instructions from skills where output_type = $1 and id = $2', [outputType, skillId])
  }
  return queryOne<{ id: string; instructions: string }>(
    'select id, instructions from skills where output_type = $1 order by is_default desc, updated_at desc limit 1',
    [outputType],
  )
}

/** Custom deliverables need a template: the one requested, or the one the existing document was made from. */
async function loadTemplate(templateId: unknown, documentId: string | undefined): Promise<Template> {
  const id =
    typeof templateId === 'string' && UUID_RE.test(templateId)
      ? templateId
      : documentId
        ? (await queryOne<{ template_id: string | null }>('select template_id from documents where id = $1', [documentId]))?.template_id
        : null
  const template = id ? await queryOne<Template>('select id, name, instructions from doc_templates where id = $1', [id]) : null
  if (!template) throw new HttpError(400, 'Pick a deliverable template first')
  return template
}

async function createDocument(projectId: string, type: DocType, content: Record<string, unknown>, template: Template | null) {
  const title =
    template?.name ?? (type === 'diagram' && typeof content.title === 'string' && content.title ? content.title : DOC_LABELS[type])
  const row = await queryOne<{ id: string }>(
    'insert into documents (project_id, type, title, template_id) values ($1, $2, $3, $4) returning id',
    [projectId, type, title, template?.id ?? null],
  )
  return row!.id
}
