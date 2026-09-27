// Auto-export: the latest version of every document is written to disk as real files
// (<DOCS_DIR>/<Project>/<Title>.docx|.xlsx|.md|.mmd) so they can be opened, attached and shared outside the app.
import { spawn } from 'node:child_process'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DeckContent } from '../shared/deck/types.ts'
import { drawioShortcut } from '../shared/drawio.ts'
import { toMarkdown } from '../shared/docMarkdown.ts'
import { DOCX_TYPES, exportDocx } from '../shared/export/docx.ts'
import { XLSX_TYPES, exportXlsx } from '../shared/export/xlsx.ts'
import type { AnyDocContent, DiagramContent, DocType } from '../shared/schemas.ts'
import { config } from './config.ts'
import { query, queryOne } from './db.ts'
import { buildDeckPptx } from './deck/build.ts'
import { HttpError } from './http.ts'

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** A string that is safe as one Windows path segment. */
export function safeSegment(name: string): string {
  const cleaned = name
    // Control characters are invalid in Windows file names, so matching them is the point.
    // oxlint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100)
    .trim()
  if (!cleaned) return 'Untitled'
  return RESERVED.test(cleaned) ? `${cleaned}_` : cleaned
}

export function projectDir(projectName: string): string {
  return path.join(config.docsDir, safeSegment(projectName))
}

function insideDocsDir(file: string): boolean {
  const rel = path.relative(config.docsDir, file)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

async function removeFiles(files: string[]): Promise<void> {
  await Promise.all(
    files.filter(insideDocsDir).map((f) =>
      unlink(f).catch((e) => {
        if ((e as { code?: string }).code !== 'ENOENT') throw e
      }),
    ),
  )
}

async function renderFiles(type: DocType, title: string, content: AnyDocContent, projectId: string): Promise<{ ext: string; data: Buffer }[]> {
  const files: { ext: string; data: Buffer }[] = [{ ext: 'md', data: Buffer.from(toMarkdown(type, title, content), 'utf8') }]
  if (type === 'deck') files.push({ ext: 'pptx', data: await buildDeckPptx(content as DeckContent, projectId) })
  if (type === 'diagram') {
    const { mermaid } = content as DiagramContent
    files.push({ ext: 'mmd', data: Buffer.from(mermaid, 'utf8') })
    // Double-click opens the diagram as an editable draw.io diagram.
    files.push({ ext: 'drawio.url', data: Buffer.from(await drawioShortcut(mermaid), 'utf8') })
  }
  if (DOCX_TYPES.includes(type)) files.push({ ext: 'docx', data: Buffer.from(await (await exportDocx(type, title, content)).arrayBuffer()) })
  if (XLSX_TYPES.includes(type)) files.push({ ext: 'xlsx', data: Buffer.from(await (await exportXlsx(type, title, content)).arrayBuffer()) })
  return files
}

interface DocRow {
  id: string
  type: DocType
  title: string
  project_id: string
  project_name: string
  export_files: string[]
}

/** Writes the latest version of a document to disk and removes files from its previous export (e.g. after a rename). */
export async function exportDocumentFiles(documentId: string): Promise<string[]> {
  const doc = await queryOne<DocRow>(
    `select d.id, d.type, d.title, d.project_id, d.export_files, p.name as project_name
     from documents d join projects p on p.id = d.project_id where d.id = $1`,
    [documentId],
  )
  if (!doc) return []
  const latest = await queryOne<{ content: AnyDocContent }>(
    'select content from document_versions where document_id = $1 order by version_no desc limit 1',
    [documentId],
  )
  if (!latest) return []

  // Two documents with the same title (e.g. several diagrams) must not overwrite each other.
  const clash = await queryOne('select 1 from documents where project_id = $1 and title = $2 and id <> $3', [doc.project_id, doc.title, doc.id])
  const base = safeSegment(clash ? `${doc.title} (${doc.id.slice(0, 8)})` : doc.title)
  const dir = projectDir(doc.project_name)
  await mkdir(dir, { recursive: true })

  const written: string[] = []
  for (const f of await renderFiles(doc.type, doc.title, latest.content, doc.project_id)) {
    const file = path.join(dir, `${base}.${f.ext}`)
    await writeFile(file, f.data)
    written.push(file)
  }
  await removeFiles(doc.export_files.filter((f) => !written.includes(f)))
  await query('update documents set export_files = $2 where id = $1', [doc.id, written])
  return written
}

export async function exportProjectFiles(projectId: string): Promise<number> {
  const docs = await query<{ id: string }>('select id from documents where project_id = $1', [projectId])
  for (const d of docs) await exportDocumentFiles(d.id)
  return docs.length
}

/** Files this app exported for the given documents — deleted together with the documents. */
export async function removeExportedFiles(where: { documentId?: string; projectId?: string }): Promise<void> {
  const rows = where.documentId
    ? await query<{ export_files: string[] }>('select export_files from documents where id = $1', [where.documentId])
    : await query<{ export_files: string[] }>('select export_files from documents where project_id = $1', [where.projectId])
  await removeFiles(rows.flatMap((r) => r.export_files))
}

// ---------- browsing a project's folder ----------

export interface ProjectFile {
  name: string
  size: number
  modified: string
}

async function dirFor(projectId: string): Promise<string> {
  const p = await queryOne<{ name: string }>('select name from projects where id = $1', [projectId])
  if (!p) throw new HttpError(404, 'Project not found')
  return projectDir(p.name)
}

/** Resolves a file name inside the project folder; refuses anything that is not a plain name. */
export async function projectFilePath(projectId: string, name: string): Promise<string> {
  if (!name || path.basename(name) !== name || name === '.' || name === '..') throw new HttpError(400, 'Invalid file name')
  return path.join(await dirFor(projectId), name)
}

export async function listProjectFiles(projectId: string): Promise<{ dir: string; files: ProjectFile[] }> {
  const dir = await dirFor(projectId)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') return { dir, files: [] }
    throw e
  }
  const files: ProjectFile[] = []
  for (const name of names) {
    const s = await stat(path.join(dir, name))
    if (s.isFile()) files.push({ name, size: s.size, modified: s.mtime.toISOString() })
  }
  return { dir, files: files.sort((a, b) => a.name.localeCompare(b.name)) }
}

export async function deleteProjectFile(projectId: string, name: string): Promise<void> {
  const file = await projectFilePath(projectId, name)
  await unlink(file).catch((e) => {
    if ((e as { code?: string }).code !== 'ENOENT') throw e
  })
  await query('update documents set export_files = array_remove(export_files, $2) where project_id = $1', [projectId, file])
}

/** Opens a folder (or a file with its default app) in Windows Explorer on this machine. */
export async function revealInExplorer(target: string, isDir: boolean): Promise<void> {
  if (process.platform !== 'win32') throw new HttpError(501, 'Opening folders is only supported on Windows')
  if (isDir) await mkdir(target, { recursive: true })
  else await stat(target).catch(() => {
    throw new HttpError(404, 'File not found')
  })
  spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref()
}
