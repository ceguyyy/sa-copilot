// Open questions for the client: CRUD. Answered ones feed the AI context as confirmed client answers.
import { Hono } from 'hono'
import { z } from 'zod'
import { query, queryOne, withTransaction } from '../db.ts'
import { HttpError, idParam, notFound, parseJson, UUID_RE } from '../http.ts'
import { toSetClause } from '../validation.ts'

const questionInput = z.object({
  question: z.string().trim().min(1).max(2000),
  context: z.string().max(2000).default(''),
})

const questionPatch = z
  .object({
    question: z.string().trim().min(1).max(2000),
    context: z.string().max(2000),
    status: z.enum(['open', 'answered', 'dropped']),
    answer: z.string().max(5000),
  })
  .partial()

export const questions = new Hono()

questions.post('/projects/:id/questions/bulk', async c => {
  const projectId = idParam(c)
  const req = await parseJson(c, z.object({ ids: z.array(z.string().regex(UUID_RE)).min(1).max(500), action: z.enum(['drop', 'delete']) }))
  const ids = [...new Set(req.ids)]
  const affected = await withTransaction(async tx => {
    const { rows } = await tx.query('select id from open_questions where project_id=$1 and id=any($2::uuid[]) for update', [projectId, ids])
    if (rows.length !== ids.length) throw new HttpError(409, 'Some selected questions no longer exist in this project. Refresh the list and try again.')
    if (req.action === 'delete') {
      await tx.query('delete from open_questions where project_id=$1 and id=any($2::uuid[])', [projectId, ids])
      await tx.query('select audit($1,$2,$3,$4)', [projectId, 'question.bulk-delete', `Deleted ${rows.length} selected questions`, JSON.stringify({ questionIds: ids })])
    }
    else await tx.query("update open_questions set status='dropped' where project_id=$1 and id=any($2::uuid[])", [projectId, ids])
    return rows.length
  })
  return c.json({ affected })
})

questions.get('/projects/:id/questions', async (c) =>
  c.json(
    await query(
      `select * from open_questions where project_id = $1
       order by case status when 'open' then 0 when 'answered' then 1 else 2 end, created_at desc`,
      [idParam(c)],
    ),
  ),
)

questions.post('/projects/:id/questions', async (c) => {
  const q = await parseJson(c, questionInput)
  const row = await queryOne(`insert into open_questions (project_id, question, context, origin) values ($1, $2, $3, 'manual') returning *`, [
    idParam(c),
    q.question,
    q.context,
  ])
  return c.json(row, 201)
})

questions.patch('/questions/:id', async (c) => {
  const id = idParam(c)
  const set = toSetClause(await parseJson(c, questionPatch), 2)
  return c.json(notFound(await queryOne(`update open_questions set ${set.sql} where id = $1 returning *`, [id, ...set.values]), 'Question'))
})

questions.delete('/questions/:id', async (c) => {
  await query('delete from open_questions where id = $1', [idParam(c)])
  return c.body(null, 204)
})
