// Cross-checks a project's latest documents against each other and the requirements, and stores the findings.
import { z } from 'zod'
import { query, queryOne } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { BASE_SYSTEM, toolEvents } from './common.ts'
import { loadProjectContext, renderContextText } from './context.ts'
import type { Stream } from './stream.ts'
import { arr, obj, runStructured, str } from './structured.ts'

const input = z.object({ projectId: z.string().regex(UUID_RE) })

const schema = obj({
  summary: str('2–3 sentences: overall consistency and the most important fix'),
  issues: arr(
    obj({
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      title: str('Short name of the problem'),
      documents: arr(str('Label of an involved document, e.g. "SOW — Cekat" or "Timeline"')),
      detail: str('What exactly disagrees — quote the conflicting values'),
      suggestion: str('The concrete fix, naming which document to change'),
    }),
  ),
})

const TASK = `Check the project's CURRENT PROJECT DOCUMENTS for consistency with each other and with the CLIENT REQUIREMENTS and answered questions.
Look for, in particular:
- scope items in the TOR / Assessment that are missing from the SOW, or SOW scope that the TOR never mentions;
- mandays, durations, milestones or dates in the SOW that differ from the Timeline (the Timeline's SLA/Days are the source of truth);
- package, channels, integrations, quantities or prices that differ between documents;
- requirements (or answered client questions) that no deliverable covers;
- contradictions inside a single document.
Only report real, specific problems with the values quoted. severity: high = would mislead the client or change price/scope, medium = should fix before sending, low = wording/cosmetic.
If a document type does not exist yet, don't report it as an issue unless another document depends on it. If everything is consistent, return an empty issues list.`

export async function checkConsistency(body: unknown, out: Stream): Promise<void> {
  const { projectId } = input.parse(body)
  const ctx = await loadProjectContext(projectId)
  if (ctx.docs.length === 0) throw new HttpError(400, 'Draft at least one deliverable first')

  const { data, model } = await runStructured({
    system: [BASE_SYSTEM, renderContextText(ctx)],
    task: TASK,
    schema,
    resultName: 'consistency report',
    maxTokens: 16000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })
  const result = { summary: String(data.summary ?? ''), issues: Array.isArray(data.issues) ? data.issues : [] }
  const saved = await queryOne('insert into consistency_checks (project_id, model, result) values ($1, $2, $3) returning *', [projectId, model.id, result])
  out.send({ type: 'result', data: saved })
  out.send({ type: 'done' })
}

export async function latestConsistencyCheck(projectId: string) {
  return (await query('select * from consistency_checks where project_id = $1 order by created_at desc limit 1', [projectId]))[0] ?? null
}
