import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import { DOC_LABELS, type DocType } from './schemas.ts'

type Block = Anthropic.Beta.BetaContentBlockParam

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

interface DocRow {
  id: string
  type: DocType
  title: string
  document_versions: { version_no: number; content: unknown }[]
}

export interface ProjectContext {
  project: Record<string, unknown>
  sources: SourceRow[]
  docs: { id: string; type: DocType; title: string; version: number; content: unknown }[]
}

export async function loadProjectContext(db: SupabaseClient, projectId: string): Promise<ProjectContext> {
  const { data: project, error: pErr } = await db.from('projects').select('*').eq('id', projectId).single()
  if (pErr || !project) throw new HttpError(404, 'Project not found')

  const { data: sources, error: sErr } = await db
    .from('sources')
    .select('id, project_id, kind, name, mime_type, storage_path, extracted_text')
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .order('created_at')
  if (sErr) throw new HttpError(500, `Failed to load sources: ${sErr.message}`)

  const { data: docs, error: dErr } = await db
    .from('documents')
    .select('id, type, title, document_versions(version_no, content)')
    .eq('project_id', projectId)
    .order('version_no', { referencedTable: 'document_versions', ascending: false })
    .limit(1, { referencedTable: 'document_versions' })
  if (dErr) throw new HttpError(500, `Failed to load documents: ${dErr.message}`)

  return {
    project,
    sources: (sources ?? []) as SourceRow[],
    docs: ((docs ?? []) as DocRow[])
      .filter((d) => d.document_versions.length > 0)
      .map((d) => ({
        id: d.id,
        type: d.type,
        title: d.title,
        version: d.document_versions[0].version_no,
        content: d.document_versions[0].content,
      })),
  }
}

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
    for (const s of withText) parts.push(`<source name="${s.name}">\n${s.extracted_text}\n</source>`)
  }
  section('CLIENT REQUIREMENTS', ctx.sources.filter((s) => s.kind === 'requirement'))
  section('PROJECT KNOWLEDGE', ctx.sources.filter((s) => s.kind === 'knowledge' && s.project_id))
  section('GLOBAL KNOWLEDGE (Cekat products, pricing, standard practice)', ctx.sources.filter((s) => !s.project_id))

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

/** Images and scanned PDFs are sent natively so Claude can read them. */
export async function loadAttachmentBlocks(db: SupabaseClient, ctx: ProjectContext): Promise<Block[]> {
  const candidates = ctx.sources
    .filter((s) => s.storage_path && s.mime_type)
    .filter(
      (s) =>
        s.mime_type!.startsWith('image/') ||
        (s.mime_type === 'application/pdf' && (s.extracted_text?.length ?? 0) < SCANNED_PDF_TEXT_THRESHOLD),
    )
    .slice(0, MAX_ATTACHMENTS)

  const blocks: Block[] = []
  for (const s of candidates) {
    const { data, error } = await db.storage.from('sources').download(s.storage_path!)
    if (error || !data) {
      console.error(`attachment download failed for ${s.name}:`, error?.message)
      continue
    }
    const b64 = toBase64(new Uint8Array(await data.arrayBuffer()))
    if (s.mime_type === 'application/pdf') {
      blocks.push({ type: 'document', title: s.name, source: { type: 'base64', media_type: 'application/pdf', data: b64 } })
    } else if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(s.mime_type!)) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: s.mime_type as 'image/png', data: b64 },
      })
      blocks.push({ type: 'text', text: `(image above: ${s.name})` })
    }
  }
  return blocks
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
