// Meeting notes → structured requirements. The notes (typed, pasted or attached — including audio that
// markitdown transcribes) are turned into requirements, decisions, action items and open questions,
// saved as a requirement source, and the questions go to the open questions tracker.
import { z } from 'zod'
import { attachmentIds, requestFiles } from '../attachments.ts'
import { query, queryOne } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { BASE_SYSTEM, toolEvents } from './common.ts'
import { loadProjectContext, renderContextText } from './context.ts'
import { activeModel } from './models.ts'
import type { Stream } from './stream.ts'
import { arr, obj, runStructured, str } from './structured.ts'

const MAX_NOTES_CHARS = 200_000

const input = z.object({
  projectId: z.string().regex(UUID_RE),
  title: z.string().trim().max(200).default(''),
  notes: z.string().max(MAX_NOTES_CHARS).default(''),
  attachmentIds,
})

const schema = obj({
  title: str('Short meeting title, e.g. "Discovery call — CS team"'),
  summary: str('3–5 sentence summary of the meeting'),
  requirements: arr(obj({ title: str(), detail: str('What the client needs, with numbers/systems mentioned') })),
  decisions: arr(str()),
  action_items: arr(obj({ task: str(), owner: str('Who — client, SA, Cekat team, or a name; "-" if unknown'), due: str('Date or "-"') })),
  open_questions: arr(obj({ question: str('Question to ask the client'), context: str('Why it matters / what it blocks') })),
})

interface Extracted {
  title: string
  summary: string
  requirements: { title: string; detail: string }[]
  decisions: string[]
  action_items: { task: string; owner: string; due: string }[]
  open_questions: { question: string; context: string }[]
}

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

function toMarkdown(m: Extracted, rawNotes: string, date: string): string {
  const parts = [`# ${m.title}`, `_${date}_`, `## Ringkasan\n${m.summary}`]
  if (m.requirements.length) parts.push(`## Requirements\n${m.requirements.map((r) => `- **${r.title}** — ${r.detail}`).join('\n')}`)
  if (m.decisions.length) parts.push(`## Keputusan\n${m.decisions.map((d) => `- ${d}`).join('\n')}`)
  if (m.action_items.length) parts.push(`## Action items\n${m.action_items.map((a) => `- [ ] ${a.task} — ${a.owner} (${a.due})`).join('\n')}`)
  if (m.open_questions.length) parts.push(`## Pertanyaan terbuka\n${m.open_questions.map((q) => `- ${q.question}`).join('\n')}`)
  if (rawNotes.trim()) parts.push(`## Catatan asli\n${rawNotes.trim()}`)
  return parts.join('\n\n')
}

export async function processMeetingNotes(body: unknown, out: Stream): Promise<void> {
  const req = input.parse(body)
  if (!req.notes.trim() && !req.attachmentIds.length) throw new HttpError(400, 'Paste the notes or attach a file')
  const [ctx, model] = await Promise.all([loadProjectContext(req.projectId), activeModel()])
  const files = await requestFiles(req.attachmentIds, model.vision)
  const task = [
    `Process these meeting notes for the project${req.title ? ` (meeting: "${req.title}")` : ''}.`,
    'Extract only what the notes actually say. Requirements must be new or changed compared with the existing CLIENT REQUIREMENTS; skip ones already captured.',
    'Open questions are things the SA still has to confirm with the client; skip ones already answered in the notes.',
    req.notes.trim() && `# MEETING NOTES\n${req.notes.trim()}`,
    files.text,
  ]
    .filter(Boolean)
    .join('\n\n')

  const { data } = await runStructured({
    system: [BASE_SYSTEM, renderContextText(ctx)],
    task,
    schema,
    resultName: 'meeting summary',
    useDocTools: true,
    maxTokens: 16000,
    attachments: async () => files.images,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })
  const m: Extracted = {
    title: String(data.title || req.title || 'Meeting notes'),
    summary: String(data.summary ?? ''),
    requirements: list(data.requirements),
    decisions: list<string>(data.decisions).map(String),
    action_items: list(data.action_items),
    open_questions: list(data.open_questions),
  }

  const date = new Date().toISOString().slice(0, 10)
  const title = req.title || m.title
  const source = await queryOne<{ id: string }>(
    `insert into sources (project_id, kind, name, extracted_text, mime_type) values ($1, 'requirement', $2, $3, 'text/markdown') returning id`,
    [req.projectId, `Meeting — ${title} (${date})`.slice(0, 300), toMarkdown({ ...m, title }, req.notes, date)],
  )
  for (const q of m.open_questions.filter((q) => q.question?.trim())) {
    await query(`insert into open_questions (project_id, question, context, origin) values ($1, $2, $3, 'meeting')`, [
      req.projectId,
      q.question.trim().slice(0, 2000),
      String(q.context ?? '').slice(0, 2000),
    ])
  }
  out.send({ type: 'result', data: { sourceId: source!.id, ...m } })
  out.send({ type: 'done' })
}
