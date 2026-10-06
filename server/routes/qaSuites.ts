// QA Testing (sidebar): stand-alone test suites — livechat link, knowledge and cases — independent of projects.
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { config } from '../config.ts'
import { query, queryOne } from '../db.ts'
import { HttpError, idParam, notFound, parseJson } from '../http.ts'
import { convertToMarkdown, shouldConvert } from '../markitdown.ts'
import { deleteUpload, resolveKey, saveUpload } from '../storage.ts'
import { qaActionCheck, toSetClause } from '../validation.ts'
import { isLivechatUrl } from '../../shared/pocQa.ts'

/** Suite cases use the happy-case shape, so the same planner and runner apply. */
export const suiteCases = z
  .array(
    z.object({
      title: z.string().trim().max(200),
      goal: z.string().max(2_000).default(''),
      steps: z.array(z.object({ user: z.string().max(5_000), ai: z.string().max(5_000), action: z.string().max(2_000).default('') })).max(40),
    }),
  )
  .max(50)

const livechatUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || isLivechatUrl(v), 'Livechat link must be an https://live.cekat.ai/… link')

const suiteInput = z.object({ name: z.string().trim().min(1).max(200) })
const suitePatch = z.object({ name: z.string().trim().min(1).max(200), livechat_url: livechatUrl, context: z.string().max(20_000), cases: suiteCases }).partial()
const knowledgeText = z.object({ name: z.string().trim().min(1).max(300), text: z.string().trim().min(1).max(2_000_000) })

const MAX_KNOWLEDGE_CHARS = 2_000_000

/** Postgres text cannot hold NUL characters, which some extractors leave in. */
const cleanText = (text: string) => text.replaceAll('\u0000', '')

export const qaSuites = new Hono()

qaSuites.get('/qa-suites', async (c) => c.json(await query('select * from qa_suites order by updated_at desc')))

qaSuites.post('/qa-suites', async (c) => {
  const { name } = await parseJson(c, suiteInput)
  return c.json(await queryOne('insert into qa_suites (name) values ($1) returning *', [name]), 201)
})

qaSuites.patch('/qa-suites/:id', async (c) => {
  const patch = await parseJson(c, suitePatch)
  // jsonb arrays must be sent as JSON text (node-postgres turns JS arrays into Postgres arrays).
  const set = toSetClause({ ...patch, cases: patch.cases && JSON.stringify(patch.cases) }, 2)
  const row = await queryOne(`update qa_suites set ${set.sql}, updated_at = now() where id = $1 returning *`, [idParam(c), ...set.values])
  return c.json(notFound(row, 'QA suite'))
})

qaSuites.delete('/qa-suites/:id', async (c) => {
  await query('delete from qa_suites where id = $1', [idParam(c)])
  return c.body(null, 204)
})

qaSuites.get('/qa-suites/:id/knowledge', async (c) =>
  c.json(await query('select id, suite_id, name, mime_type, size_bytes, created_at, char_length(extracted_text) as chars from qa_suite_knowledge where suite_id = $1 order by created_at', [idParam(c)])),
)

qaSuites.post('/qa-suites/:id/knowledge/text', async (c) => {
  const k = await parseJson(c, knowledgeText)
  const row = await queryOne(
    `insert into qa_suite_knowledge (suite_id, name, mime_type, extracted_text, size_bytes) values ($1, $2, 'text/plain', $3, $4)
     returning id, suite_id, name, mime_type, size_bytes, created_at, char_length(extracted_text) as chars`,
    [idParam(c), k.name, cleanText(k.text), Buffer.byteLength(k.text)],
  )
  return c.json(row, 201)
})

/** Stores the file's text only (markitdown, else what the browser extracted); the file itself is not kept. */
qaSuites.post('/qa-suites/:id/knowledge/upload', bodyLimit({ maxSize: config.maxUploadBytes + 10 * 1024 * 1024 }), async (c) => {
  const suiteId = idParam(c)
  const form = await c.req.parseBody()
  const file = form.file
  if (!(file instanceof File)) throw new HttpError(400, 'Missing file')
  if (file.size > config.maxUploadBytes) throw new HttpError(413, 'File is larger than 50 MB')
  const browserText = typeof form.extractedText === 'string' ? form.extractedText : ''
  const key = await saveUpload(file)
  try {
    const markdown = shouldConvert(file.type, file.name) ? await convertToMarkdown(resolveKey(key)) : null
    const text = cleanText(markdown ?? browserText).slice(0, MAX_KNOWLEDGE_CHARS)
    if (!text.trim()) throw new HttpError(422, `No text could be read from ${file.name}`)
    const row = await queryOne(
      `insert into qa_suite_knowledge (suite_id, name, mime_type, extracted_text, size_bytes) values ($1, $2, $3, $4, $5)
       returning id, suite_id, name, mime_type, size_bytes, created_at, char_length(extracted_text) as chars`,
      [suiteId, file.name, file.type || null, text, file.size],
    )
    return c.json(row, 201)
  } finally {
    await deleteUpload(key)
  }
})

qaSuites.delete('/qa-knowledge/:id', async (c) => {
  await query('delete from qa_suite_knowledge where id = $1', [idParam(c)])
  return c.body(null, 204)
})

qaSuites.get('/qa-suites/:id/runs', async (c) => c.json(await query('select * from qa_suite_runs where suite_id = $1 order by created_at desc limit 50', [idParam(c)])))

qaSuites.patch('/qa-suite-runs/:id/action-check', async (c) => {
  const v = await parseJson(c, qaActionCheck)
  const row = await queryOne(
    `update qa_suite_runs set report = jsonb_set(report, array['cases', $2::text, 'steps', $3::text, 'actionCheck'], to_jsonb($4::text))
     where id = $1 and jsonb_typeof(report #> array['cases', $2::text, 'steps', $3::text]) = 'object' returning *`,
    [idParam(c), String(v.caseIndex), String(v.stepIndex), v.actionCheck],
  )
  return c.json(notFound(row, 'QA step'))
})

qaSuites.delete('/qa-suite-runs/:id', async (c) => {
  await query('delete from qa_suite_runs where id = $1', [idParam(c)])
  return c.body(null, 204)
})
