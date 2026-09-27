// Plain-language summary of what changed between two versions of a document.
import { z } from 'zod'
import { toMarkdown } from '../../shared/docMarkdown.ts'
import type { AnyDocContent, DocType } from '../../shared/schemas.ts'
import { config } from '../config.ts'
import { query, queryOne } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { BASE_SYSTEM, resolveEffort } from './common.ts'
import { runModel } from './llm/index.ts'
import { activeModel } from './models.ts'
import type { Stream } from './stream.ts'

const input = z.object({
  documentId: z.string().regex(UUID_RE),
  fromVersionId: z.string().regex(UUID_RE),
  toVersionId: z.string().regex(UUID_RE),
})

interface VersionRow {
  id: string
  version_no: number
  content: AnyDocContent
  note: string
  origin: string
  created_at: Date
}

export async function summarizeVersionDiff(body: unknown, out: Stream): Promise<void> {
  const req = input.parse(body)
  const doc = await queryOne<{ type: DocType; title: string; language: string }>(
    'select d.type, d.title, p.language from documents d join projects p on p.id = d.project_id where d.id = $1',
    [req.documentId],
  )
  if (!doc) throw new HttpError(404, 'Document not found')
  const rows = await query<VersionRow>('select * from document_versions where document_id = $1 and id = any($2::uuid[])', [
    req.documentId,
    [req.fromVersionId, req.toVersionId],
  ])
  const from = rows.find((r) => r.id === req.fromVersionId)
  const to = rows.find((r) => r.id === req.toVersionId)
  if (!from || !to) throw new HttpError(404, 'Version not found')
  const [older, newer] = from.version_no <= to.version_no ? [from, to] : [to, from]

  const render = (v: VersionRow) =>
    `# v${v.version_no} (${v.origin}, ${v.created_at.toISOString().slice(0, 16).replace('T', ' ')}) — note: ${v.note || '-'}\n${toMarkdown(doc.type, doc.title, v.content)}`

  const model = await activeModel()
  const result = await runModel({
    model,
    system: [BASE_SYSTEM, `Write in ${doc.language}.`],
    turns: [
      {
        role: 'user',
        content: `Summarise what changed in "${doc.title}" from v${older.version_no} to v${newer.version_no}.
Start with one line like "v${older.version_no} → v${newer.version_no}: …" naming the biggest change, then a short bulleted list grouped as Ditambah / Diubah / Dihapus (translate the headings to the output language), quoting concrete values (scope items, mandays, prices, dates). Finish with one line on the impact for the client, if any. Ignore pure formatting changes.

${render(older)}

${render(newer)}`,
      },
    ],
    attachments: [],
    tools: [],
    runTool: async () => 'No tools available',
    effort: await resolveEffort(model, config.anthropic.chatEffort),
    maxTokens: 6000,
    onText: (text) => out.send({ type: 'delta', text }),
  })
  out.send({ type: 'done', stop_reason: result.stopReason })
}
