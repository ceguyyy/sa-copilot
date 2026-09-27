// Plain-language summary of a project's audit trail: what changed, what the AI did, what is still open.
import { z } from 'zod'
import { config } from '../config.ts'
import { query, queryOne } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { BASE_SYSTEM, resolveEffort } from './common.ts'
import { runModel } from './llm/index.ts'
import { activeModel } from './models.ts'
import type { Stream } from './stream.ts'

const MAX_EVENTS = 400

const input = z.object({
  projectId: z.string().regex(UUID_RE),
  /** Only summarise the last N days; omitted = everything. */
  days: z.number().int().min(1).max(3650).optional(),
  question: z.string().max(2000).optional(),
})

export async function summarizeAudit(body: unknown, out: Stream): Promise<void> {
  const { projectId, days, question } = input.parse(body)
  const project = await queryOne<{ name: string; client_name: string; status: string }>('select name, client_name, status from projects where id = $1', [projectId])
  if (!project) throw new HttpError(404, 'Project not found')
  const events = await query<{ at: Date; action: string; summary: string }>(
    `select at, action, summary from audit_log
     where project_id = $1 and ($2::int is null or at > now() - make_interval(days => $2::int))
     order by at desc limit $3`,
    [projectId, days ?? null, MAX_EVENTS],
  )
  if (!events.length) throw new HttpError(400, 'No activity in this period yet')

  const log = events
    .reverse()
    .map((e) => `${e.at.toISOString().slice(0, 16).replace('T', ' ')}  [${e.action}]  ${e.summary}`)
    .join('\n')
  const task = question?.trim()
    ? `Answer this question about the project's activity log: ${question.trim()}`
    : `Summarise the project's activity log for the SA:
1. **Ringkasan** — 2–3 sentences on where the project stands.
2. **Perubahan penting** — grouped by deliverable, newest first, with dates.
3. **Aktivitas AI vs manual** — what the AI drafted/revised and what the SA edited by hand.
4. **Perlu perhatian** — anything that looks unfinished, reverted, or inconsistent (e.g. SOW older than the latest Timeline).`

  const model = await activeModel()
  const result = await runModel({
    model,
    system: [BASE_SYSTEM, `# PROJECT\n${project.name} — ${project.client_name} (status: ${project.status})`, `# ACTIVITY LOG (${events.length} events, oldest first)\n${log}`],
    turns: [{ role: 'user', content: task }],
    attachments: [],
    tools: [],
    runTool: async () => 'No tools available',
    effort: await resolveEffort(model, config.anthropic.chatEffort),
    maxTokens: 8000,
    onText: (text) => out.send({ type: 'delta', text }),
  })
  out.send({ type: 'done', stop_reason: result.stopReason })
}
