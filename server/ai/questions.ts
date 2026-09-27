// Finds what still needs client confirmation — items the documents mark as unconfirmed, assumptions, gaps —
// and adds them to the open questions tracker (skipping ones already tracked).
import { z } from 'zod'
import { query } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { BASE_SYSTEM, toolEvents } from './common.ts'
import { loadProjectContext, renderContextText } from './context.ts'
import type { Stream } from './stream.ts'
import { arr, obj, runStructured, str } from './structured.ts'

const MAX_NEW = 40

const input = z.object({ projectId: z.string().regex(UUID_RE) })

const schema = obj({
  questions: arr(obj({ question: str('One question the SA should ask the client, in the project language'), context: str('Which document/section it comes from and what it blocks') })),
})

export async function findQuestions(body: unknown, out: Stream): Promise<void> {
  const { projectId } = input.parse(body)
  const ctx = await loadProjectContext(projectId)
  if (!ctx.docs.length && !ctx.sources.length) throw new HttpError(400, 'Add requirements or draft a deliverable first')

  const { data } = await runStructured({
    system: [BASE_SYSTEM, renderContextText(ctx)],
    task: `List the questions the SA still has to ask the client. Sources: anything the documents mark as needing client confirmation (e.g. assessment rows with status needs_confirmation, "TBD", "perlu konfirmasi"), assumptions stated in the SOW/TOR, and requirements too vague to scope or price.
Do NOT repeat questions already listed under OPEN QUESTIONS or answered under CLIENT ANSWERS. Merge duplicates, keep each question specific and answerable, most important first, at most ${MAX_NEW}.`,
    schema,
    resultName: 'list of client questions',
    maxTokens: 12000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })

  const known = new Set(ctx.questions.map((q) => q.question.trim().toLowerCase()))
  const found = (Array.isArray(data.questions) ? data.questions : [])
    .map((q: { question?: unknown; context?: unknown }) => ({ question: String(q.question ?? '').trim(), context: String(q.context ?? '').trim() }))
    .filter((q) => q.question && !known.has(q.question.toLowerCase()))
    .slice(0, MAX_NEW)
  for (const q of found) {
    await query(`insert into open_questions (project_id, question, context, origin) values ($1, $2, $3, 'ai')`, [projectId, q.question.slice(0, 2000), q.context.slice(0, 2000)])
  }
  out.send({ type: 'result', data: { added: found.length } })
  out.send({ type: 'done' })
}
