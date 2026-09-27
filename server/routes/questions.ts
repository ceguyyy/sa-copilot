// Open questions for the client: CRUD. Answered ones feed the AI context as confirmed client answers.
import { Hono } from 'hono'
import { z } from 'zod'
import { query, queryOne } from '../db.ts'
import { idParam, notFound, parseJson } from '../http.ts'
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
