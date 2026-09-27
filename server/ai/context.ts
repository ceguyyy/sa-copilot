import { DOC_LABELS, type DocType } from '../../shared/schemas.ts'
import { query, queryOne } from '../db.ts'
import { HttpError } from '../http.ts'
import { readUpload } from '../storage.ts'
import type { Attachment } from './llm/types.ts'

const MAX_ATTACHMENTS = 10
const SCANNED_PDF_TEXT_THRESHOLD = 200

interface SourceRow {
  id: string
  project_id: string | null
  kind: 'requirement' | 'knowledge'
  name: string
  mime_type: string | null
  storage_path: string | null
  extracted_text: string | null
}

interface DocSnapshot {
  id: string
  type: DocType
  title: string
  version: number
  content: unknown
}

export interface ProjectContext {
  project: Record<string, unknown>
  sources: SourceRow[]
  docs: DocSnapshot[]
  /** Documents from other projects that were flagged "use as knowledge". */
  knowledgeDocs: (DocSnapshot & { project_name: string })[]
}

// Latest version of each document, joined laterally so one query covers all documents.
const LATEST_DOCS = `
  select d.id, d.type, d.title, v.version_no as version, v.content, p.name as project_name
  from documents d
  join projects p on p.id = d.project_id
  join lateral (
    select version_no, content from document_versions
    where document_id = d.id order by version_no desc limit 1
  ) v on true`

export async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const project = await queryOne('select * from projects where id = $1', [projectId])
  if (!project) throw new HttpError(404, 'Project not found')

  const [sources, docs, knowledgeDocs] = await Promise.all([
    query<SourceRow>(
      `select id, project_id, kind, name, mime_type, storage_path, extracted_text
       from sources where (project_id = $1 or project_id is null) and enabled order by created_at`,
      [projectId],
    ),
    query<DocSnapshot>(`${LATEST_DOCS} where d.project_id = $1 order by d.created_at`, [projectId]),
    query<ProjectContext['knowledgeDocs'][number]>(
      `${LATEST_DOCS} where d.is_knowledge and d.project_id <> $1 order by d.updated_at desc`,
      [projectId],
    ),
  ])
  return { project, sources, docs, knowledgeDocs }
}

/** Global knowledge only (no project): used by the skill assistant. */
export async function loadGlobalKnowledgeText(): Promise<string> {
  const [sources, docs] = await Promise.all([
    query<SourceRow>(`select * from sources where project_id is null and enabled order by created_at`),
    query<ProjectContext['knowledgeDocs'][number]>(`${LATEST_DOCS} where d.is_knowledge order by d.updated_at desc`),
  ])
  const parts = ['# GLOBAL KNOWLEDGE (Cekat products, pricing, standard practice)']
  for (const s of sources) if (s.extracted_text?.trim()) parts.push(sourceBlock(s))
  for (const d of docs) parts.push(knowledgeDocBlock(d))
  return parts.join('\n\n')
}

const sourceBlock = (s: SourceRow) => `<source name="${s.name}">\n${s.extracted_text}\n</source>`

const knowledgeDocBlock = (d: ProjectContext['knowledgeDocs'][number]) =>
  `<reference_document from_project="${d.project_name}" type="${d.type}" title="${d.title}">\n${JSON.stringify(d.content)}\n</reference_document>`

/** Stable, cacheable text block describing the project, its sources and current documents. */
export function renderContextText(ctx: ProjectContext): string {
  const p = ctx.project
  const parts: string[] = [
    '# PROJECT',
    `Name: ${p.name}\nClient: ${p.client_name}\nIndustry: ${p.industry ?? '-'}\nPackage: ${p.package ?? '-'}\nStatus: ${p.status}\nDescription: ${p.description ?? '-'}`,
  ]

  const section = (title: string, rows: SourceRow[]) => {
    const withText = rows.filter((s) => s.extracted_text?.trim())
    if (!withText.length) return
    parts.push(`# ${title}`)
    for (const s of withText) parts.push(sourceBlock(s))
  }
  section('CLIENT REQUIREMENTS', ctx.sources.filter((s) => s.kind === 'requirement'))
  section('PROJECT KNOWLEDGE', ctx.sources.filter((s) => s.kind === 'knowledge' && s.project_id))
  section('GLOBAL KNOWLEDGE (Cekat products, pricing, standard practice)', ctx.sources.filter((s) => !s.project_id))

  if (ctx.knowledgeDocs.length) {
    parts.push('# REFERENCE DOCUMENTS FROM OTHER PROJECTS (flagged as knowledge — reuse their structure and standard wording, never their client-specific facts)')
    for (const d of ctx.knowledgeDocs) parts.push(knowledgeDocBlock(d))
  }

  if (ctx.docs.length) {
    parts.push('# CURRENT PROJECT DOCUMENTS (latest versions, JSON)')
    for (const d of ctx.docs) {
      parts.push(
        `<document id="${d.id}" type="${d.type}" label="${DOC_LABELS[d.type]}" title="${d.title}" version="${d.version}">\n${JSON.stringify(d.content)}\n</document>`,
      )
    }
  }
  return parts.join('\n\n')
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** Images and scanned PDFs are sent natively so the model can read them — only if it supports that input. */
export async function loadAttachments(ctx: ProjectContext, caps: { vision: boolean; pdf: boolean }): Promise<Attachment[]> {
  const candidates = ctx.sources
    .filter((s) => s.storage_path && s.mime_type)
    .filter(
      (s) =>
        (caps.vision && IMAGE_TYPES.includes(s.mime_type!)) ||
        (caps.pdf && s.mime_type === 'application/pdf' && (s.extracted_text?.length ?? 0) < SCANNED_PDF_TEXT_THRESHOLD),
    )
    .slice(0, MAX_ATTACHMENTS)

  const attachments: Attachment[] = []
  for (const s of candidates) {
    try {
      const data = (await readUpload(s.storage_path!)).toString('base64')
      attachments.push({ kind: s.mime_type === 'application/pdf' ? 'pdf' : 'image', mediaType: s.mime_type!, data, name: s.name })
    } catch (e) {
      console.error(`attachment read failed for ${s.name}:`, e instanceof Error ? e.message : e)
    }
  }
  return attachments
}
