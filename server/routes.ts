// REST API for the data the frontend reads and writes (repository layer lives in src/lib/api.ts).
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { config } from './config.ts'
import { query, queryOne, withTransaction } from './db.ts'
import { HttpError, UUID_RE, idParam, notFound, parseJson } from './http.ts'
import { exportDocumentFiles, exportProjectFiles, removeExportedFiles } from './exports.ts'
import { convertToMarkdown, shouldConvert } from './markitdown.ts'
import { deleteUpload, resolveKey, saveUpload } from './storage.ts'
import {
  documentInput,
  documentPatch,
  projectInput,
  projectPatch,
  skillBulk,
  skillInput,
  skillPatch,
  sourcePatch,
  sourceText,
  sourceUploadFields,
  toSetClause,
  versionInput,
} from './validation.ts'

export const api = new Hono()

/** Disk export runs after the response; a failure is logged, never shown as a failed save. */
function exportLater(run: () => Promise<unknown>): void {
  run().catch((e) => console.error('Auto-export failed:', e))
}

// ---------- projects ----------

api.get('/projects', async (c) => c.json(await query('select * from projects order by updated_at desc')))

api.get('/projects/:id', async (c) =>
  c.json(notFound(await queryOne('select * from projects where id = $1', [idParam(c)]), 'Project')),
)

api.post('/projects', async (c) => {
  const p = await parseJson(c, projectInput)
  const row = await queryOne(
    `insert into projects (name, client_name, industry, package, status, description)
     values ($1, $2, $3, $4, coalesce($5, 'discovery'), $6) returning *`,
    [p.name, p.client_name, p.industry ?? null, p.package ?? null, p.status ?? null, p.description ?? null],
  )
  return c.json(row, 201)
})

api.patch('/projects/:id', async (c) => {
  const id = idParam(c)
  const patch = await parseJson(c, projectPatch)
  const set = toSetClause(patch, 2)
  const row = await queryOne(`update projects set ${set.sql} where id = $1 returning *`, [id, ...set.values])
  // Renamed project → its files move to the new folder name.
  if (row && patch.name !== undefined) exportLater(() => exportProjectFiles(id))
  return c.json(notFound(row, 'Project'))
})

api.delete('/projects/:id', async (c) => {
  const id = idParam(c)
  const files = await query<{ storage_path: string }>(
    'select storage_path from sources where project_id = $1 and storage_path is not null',
    [id],
  )
  await removeExportedFiles({ projectId: id })
  await query('delete from projects where id = $1', [id])
  await Promise.all(files.map((f) => deleteUpload(f.storage_path)))
  return c.body(null, 204)
})

// ---------- sources ----------

/** `?projectId=<uuid>` lists a project's sources; no projectId lists global knowledge. */
api.get('/sources', async (c) => {
  const projectId = c.req.query('projectId')
  if (projectId && !UUID_RE.test(projectId)) throw new HttpError(400, 'Invalid projectId')
  const rows = projectId
    ? await query('select * from sources where project_id = $1 order by created_at desc', [projectId])
    : await query('select * from sources where project_id is null order by created_at desc')
  return c.json(rows)
})

api.post('/sources/text', async (c) => {
  const s = await parseJson(c, sourceText)
  const row = await queryOne(
    `insert into sources (project_id, kind, name, extracted_text, mime_type)
     values ($1, $2, $3, $4, 'text/plain') returning *`,
    [s.projectId, s.kind, s.name, s.text],
  )
  return c.json(row, 201)
})

api.post('/sources/upload', bodyLimit({ maxSize: config.maxUploadBytes + 10 * 1024 * 1024 }), async (c) => {
  const form = await c.req.parseBody()
  const file = form.file
  if (!(file instanceof File)) throw new HttpError(400, 'Missing file')
  if (file.size > config.maxUploadBytes) throw new HttpError(413, 'File is larger than 50 MB')
  const fields = sourceUploadFields.parse({
    projectId: form.projectId || null,
    kind: form.kind,
    extractedText: form.extractedText ?? '',
  })

  const key = await saveUpload(file)
  try {
    // Prefer markitdown's Markdown (compact, keeps tables/headings); the browser's text is the fallback.
    const markdown = shouldConvert(file.type, file.name) ? await convertToMarkdown(resolveKey(key)) : null
    const row = await queryOne(
      `insert into sources (project_id, kind, name, mime_type, storage_path, extracted_text, size_bytes)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [fields.projectId, fields.kind, file.name, file.type || null, key, markdown ?? fields.extractedText, file.size],
    )
    return c.json(row, 201)
  } catch (e) {
    await deleteUpload(key) // don't leave an orphaned file when the row fails
    throw e
  }
})

api.patch('/sources/:id', async (c) => {
  const id = idParam(c)
  const { enabled } = await parseJson(c, sourcePatch)
  return c.json(notFound(await queryOne('update sources set enabled = $2 where id = $1 returning *', [id, enabled]), 'Source'))
})

api.delete('/sources/:id', async (c) => {
  const row = await queryOne<{ storage_path: string | null }>(
    'delete from sources where id = $1 returning storage_path',
    [idParam(c)],
  )
  if (row?.storage_path) await deleteUpload(row.storage_path)
  return c.body(null, 204)
})

// ---------- skills ----------

api.get('/skills', async (c) => c.json(await query('select * from skills order by output_type, name')))

const SKILL_INSERT = `insert into skills (name, output_type, description, instructions, is_default)
  values ($1, $2, $3, $4, $5) returning *`

api.post('/skills', async (c) => {
  const s = await parseJson(c, skillInput)
  return c.json(await queryOne(SKILL_INSERT, [s.name, s.output_type, s.description, s.instructions, s.is_default]), 201)
})

api.post('/skills/bulk', async (c) => {
  const skills = await parseJson(c, skillBulk)
  await withTransaction(async (tx) => {
    for (const s of skills) await tx.query(SKILL_INSERT, [s.name, s.output_type, s.description, s.instructions, s.is_default])
  })
  return c.body(null, 204)
})

api.patch('/skills/:id', async (c) => {
  const id = idParam(c)
  const set = toSetClause(await parseJson(c, skillPatch), 2)
  const row = await queryOne(`update skills set ${set.sql} where id = $1 returning *`, [id, ...set.values])
  return c.json(notFound(row, 'Skill'))
})

api.delete('/skills/:id', async (c) => {
  await query('delete from skills where id = $1', [idParam(c)])
  return c.body(null, 204)
})

// ---------- documents & versions ----------

api.get('/projects/:id/documents', async (c) =>
  c.json(await query('select * from documents where project_id = $1 order by updated_at desc', [idParam(c)])),
)

/** Documents flagged as knowledge, across all projects (shown on the Knowledge page). */
api.get('/documents/knowledge', async (c) =>
  c.json(
    await query(
      `select d.*, p.name as project_name from documents d join projects p on p.id = d.project_id
       where d.is_knowledge order by d.updated_at desc`,
    ),
  ),
)

api.get('/documents/:id', async (c) =>
  c.json(notFound(await queryOne('select * from documents where id = $1', [idParam(c)]), 'Document')),
)

api.post('/documents', async (c) => {
  const d = await parseJson(c, documentInput)
  const doc = await withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'insert into documents (project_id, type, title, template_id) values ($1, $2, $3, $4) returning *',
      [d.projectId, d.type, d.title, d.templateId ?? null],
    )
    await tx.query(
      `insert into document_versions (document_id, content, origin, note) values ($1, $2, 'manual', 'Created manually')`,
      [rows[0].id, d.content],
    )
    return rows[0]
  })
  exportLater(() => exportDocumentFiles(doc.id))
  return c.json(doc, 201)
})

api.patch('/documents/:id', async (c) => {
  const id = idParam(c)
  const patch = await parseJson(c, documentPatch)
  const set = toSetClause(patch, 2)
  const row = await queryOne(`update documents set ${set.sql} where id = $1 returning *`, [id, ...set.values])
  if (row && patch.title !== undefined) exportLater(() => exportDocumentFiles(id)) // rename the files too
  return c.json(notFound(row, 'Document'))
})

api.delete('/documents/:id', async (c) => {
  const id = idParam(c)
  await removeExportedFiles({ documentId: id })
  await query('delete from documents where id = $1', [id])
  return c.body(null, 204)
})

api.get('/documents/:id/versions', async (c) =>
  c.json(await query('select * from document_versions where document_id = $1 order by version_no desc', [idParam(c)])),
)

api.post('/documents/:id/versions', async (c) => {
  const id = idParam(c)
  const v = await parseJson(c, versionInput)
  const row = await queryOne(
    'insert into document_versions (document_id, content, origin, note) values ($1, $2, $3, $4) returning *',
    [id, v.content, v.origin, v.note],
  )
  exportLater(() => exportDocumentFiles(id))
  return c.json(row, 201)
})

// ---------- chat ----------

api.get('/projects/:id/messages', async (c) =>
  c.json(await query('select * from messages where project_id = $1 order by created_at', [idParam(c)])),
)

api.delete('/projects/:id/messages', async (c) => {
  await query('delete from messages where project_id = $1', [idParam(c)])
  return c.body(null, 204)
})
