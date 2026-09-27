// Files attached to instructions: permanent reference files on a skill or format, or one-off files sent with
// a single AI request. Text comes from markitdown (browser text as fallback); images go to the model natively.
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { Attachment } from './ai/llm/types.ts'
import { config } from './config.ts'
import { query, queryOne } from './db.ts'
import { HttpError, UUID_RE, idParam } from './http.ts'
import { convertToMarkdown, shouldConvert } from './markitdown.ts'
import { deleteUpload, readUpload, resolveKey, saveUpload } from './storage.ts'

type OwnerKind = 'skill' | 'template' | 'request'

interface AttachmentRow {
  id: string
  owner_kind: OwnerKind
  owner_id: string | null
  name: string
  mime_type: string | null
  storage_path: string
  extracted_text: string | null
  size_bytes: number | null
  created_at: string
}

/** Per file and in total, so a huge spreadsheet can't blow up the prompt. */
const MAX_FILE_CHARS = 60_000
const MAX_TOTAL_CHARS = 200_000
const MAX_REQUEST_FILES = 10
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const REQUEST_TTL = '1 day'

const uploadFields = z.object({
  ownerKind: z.enum(['skill', 'template', 'request']),
  ownerId: z.string().regex(UUID_RE).nullable(),
  extractedText: z.string().max(5_000_000),
})

export const attachmentIds = z.array(z.string().regex(UUID_RE)).max(MAX_REQUEST_FILES).default([])

const PUBLIC_COLUMNS = 'id, owner_kind, owner_id, name, mime_type, size_bytes, created_at, length(extracted_text) as text_chars'

export const attachments = new Hono()

attachments.get('/attachments', async (c) => {
  const kind = c.req.query('ownerKind')
  const id = c.req.query('ownerId')
  if ((kind !== 'skill' && kind !== 'template') || !id || !UUID_RE.test(id)) throw new HttpError(400, 'ownerKind (skill|template) and ownerId are required')
  return c.json(await query(`select ${PUBLIC_COLUMNS} from attachments where owner_kind = $1 and owner_id = $2 order by created_at`, [kind, id]))
})

attachments.post('/attachments', bodyLimit({ maxSize: config.maxUploadBytes + 10 * 1024 * 1024 }), async (c) => {
  const form = await c.req.parseBody()
  const file = form.file
  if (!(file instanceof File)) throw new HttpError(400, 'Missing file')
  if (file.size > config.maxUploadBytes) throw new HttpError(413, 'File is larger than 50 MB')
  const fields = uploadFields.parse({ ownerKind: form.ownerKind, ownerId: form.ownerId || null, extractedText: form.extractedText ?? '' })
  if ((fields.ownerKind === 'request') !== (fields.ownerId === null)) throw new HttpError(400, 'ownerId is required for skill/template files only')
  if (fields.ownerId) {
    const table = fields.ownerKind === 'skill' ? 'skills' : 'doc_templates'
    if (!(await queryOne(`select 1 from ${table} where id = $1`, [fields.ownerId]))) throw new HttpError(404, `${fields.ownerKind} not found — save it first`)
  }

  const key = await saveUpload(file)
  try {
    const markdown = shouldConvert(file.type, file.name) ? await convertToMarkdown(resolveKey(key)) : null
    const row = await queryOne(
      `insert into attachments (owner_kind, owner_id, name, mime_type, storage_path, extracted_text, size_bytes)
       values ($1, $2, $3, $4, $5, $6, $7) returning ${PUBLIC_COLUMNS}`,
      [fields.ownerKind, fields.ownerId, file.name, file.type || null, key, markdown ?? fields.extractedText, file.size],
    )
    return c.json(row, 201)
  } catch (e) {
    await deleteUpload(key)
    throw e
  }
})

attachments.delete('/attachments/:id', async (c) => {
  const row = await queryOne<{ storage_path: string }>('delete from attachments where id = $1 returning storage_path', [idParam(c)])
  if (row) await deleteUpload(row.storage_path)
  return c.body(null, 204)
})

// ---------- used by the AI endpoints ----------

export interface LoadedFiles {
  /** Text block to put in the prompt ('' when there is nothing). */
  text: string
  /** Images, sent natively when the model can read them. */
  images: Attachment[]
  names: string[]
}

export const NO_FILES: LoadedFiles = { text: '', images: [], names: [] }

async function render(rows: AttachmentRow[], heading: string, canSeeImages: boolean): Promise<LoadedFiles> {
  const parts: string[] = []
  const images: Attachment[] = []
  let budget = MAX_TOTAL_CHARS
  for (const r of rows) {
    if (r.mime_type && IMAGE_TYPES.includes(r.mime_type)) {
      if (canSeeImages) {
        try {
          images.push({ kind: 'image', mediaType: r.mime_type, data: (await readUpload(r.storage_path)).toString('base64'), name: r.name })
        } catch (e) {
          console.error(`attachment read failed for ${r.name}:`, e instanceof Error ? e.message : e)
        }
      } else {
        parts.push(`<file name="${r.name}">(image — the selected model cannot read images)</file>`)
      }
      continue
    }
    const text = (r.extracted_text ?? '').trim()
    const limit = Math.min(MAX_FILE_CHARS, budget)
    if (!text || limit <= 0) {
      parts.push(`<file name="${r.name}">(no readable text${limit <= 0 ? ' — skipped, too much attached text' : ''})</file>`)
      continue
    }
    const body = text.length > limit ? `${text.slice(0, limit)}\n…(truncated)` : text
    budget -= body.length
    parts.push(`<file name="${r.name}">\n${body}\n</file>`)
  }
  return { text: parts.length ? `${heading}\n${parts.join('\n\n')}` : '', images, names: rows.map((r) => r.name) }
}

/** Permanent reference files of a skill or format. */
export async function ownerFiles(kind: 'skill' | 'template', ownerId: string | undefined, canSeeImages: boolean): Promise<LoadedFiles> {
  if (!ownerId) return NO_FILES
  const rows = await query<AttachmentRow>('select * from attachments where owner_kind = $1 and owner_id = $2 order by created_at', [kind, ownerId])
  return render(rows, `# REFERENCE FILES (attached to this ${kind === 'skill' ? 'skill' : 'format'} — follow their structure and wording)`, canSeeImages)
}

/** One-off files the user attached to this request. */
export async function requestFiles(ids: string[], canSeeImages: boolean): Promise<LoadedFiles> {
  if (!ids.length) return NO_FILES
  const rows = await query<AttachmentRow>(`select * from attachments where id = any($1::uuid[]) and owner_kind = 'request' order by created_at`, [ids])
  return render(rows, '# FILES ATTACHED TO THIS REQUEST', canSeeImages)
}

/** Deletes the reference files of a skill or format that is being deleted. */
export async function removeOwnerFiles(kind: 'skill' | 'template', ownerId: string): Promise<void> {
  const rows = await query<{ storage_path: string }>('delete from attachments where owner_kind = $1 and owner_id = $2 returning storage_path', [kind, ownerId])
  await Promise.all(rows.map((r) => deleteUpload(r.storage_path)))
}

/** One-off request files are only needed while the request runs; drop old ones on startup. */
export async function purgeOldRequestFiles(): Promise<void> {
  const rows = await query<{ storage_path: string }>(
    `delete from attachments where owner_kind = 'request' and created_at < now() - interval '${REQUEST_TTL}' returning storage_path`,
  )
  await Promise.all(rows.map((r) => deleteUpload(r.storage_path)))
}
