// The .sacopilot backup file: a zip with manifest.json, db/<table>.json (all rows) and files/<upload key>.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'

export const BACKUP_FORMAT = 'sa-copilot-backup'
export const BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_BYTES = 2 * 1024 ** 3
export const MAX_FILE_BYTES = 50 * 1024 * 1024

/** Device-local bookkeeping must never be restored from another computer. */
export const DEVICE_LOCAL_TABLES = ['local_change_clock', 'trash_file_cleanup'] as const
/** Portable tables, parents before children (the restore order). */
export const BACKUP_TABLES = [
  'projects',
  'skills',
  'doc_templates',
  'app_settings',
  'mcp_servers',
  'n8n_node_skills',
  'sources',
  'documents',
  'document_versions',
  'pocs',
  'poc_versions',
  'poc_qa_runs',
  'qa_suites',
  'qa_suite_knowledge',
  'qa_suite_runs',
  'messages',
  'attachments',
  'audit_log',
  'open_questions',
  'consistency_checks',
  'demo_scenarios',
  'enhancement_batches',
  'ai_activity',
  'source_evidence',
  'skill_releases',
  'skill_history',
  'review_alerts',
  'inbox_reads',
  'sa_environments',
  'sa_collections',
  'sa_requests',
  'sa_request_versions',
  'sa_send_history',
] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  formatVersion: typeof BACKUP_FORMAT_VERSION
  appVersion: string
  createdAt: string
  tables: Record<string, number>
  files: number
}

export interface BackupContents {
  manifest: BackupManifest
  tables: Record<string, Record<string, unknown>[]>
  files: Record<string, Uint8Array>
}

export class BackupError extends Error {}

/** Upload keys are flat "<uuid>-<safe name>" file names; anything path-like is refused. */
export function isSafeFileName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !name.startsWith('.') && /^[\w.-]+$/.test(name)
}

export function packBackup(contents: Omit<BackupContents, 'manifest'>, appVersion: string, now = new Date()): { data: Uint8Array; manifest: BackupManifest } {
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    createdAt: now.toISOString(),
    tables: Object.fromEntries(Object.entries(contents.tables).map(([t, rows]) => [t, rows.length])),
    files: Object.keys(contents.files).length,
  }
  const zip: Zippable = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)) }
  for (const [table, rows] of Object.entries(contents.tables)) zip[`db/${table}.json`] = strToU8(JSON.stringify(rows))
  for (const [name, bytes] of Object.entries(contents.files)) {
    if (!isSafeFileName(name)) throw new BackupError(`Unsafe file name "${name}"`)
    // Most uploads (PDF, DOCX, images) are already compressed.
    zip[`files/${name}`] = [bytes, { level: 0 }]
  }
  return { data: zipSync(zip, { level: 6 }), manifest }
}

function readManifest(entry: Uint8Array | undefined): BackupManifest {
  if (!entry) throw new BackupError('Not an SA Copilot backup (manifest.json missing)')
  let manifest: Partial<BackupManifest>
  try {
    manifest = JSON.parse(strFromU8(entry))
  } catch {
    throw new BackupError('manifest.json is not valid JSON')
  }
  if (manifest.format !== BACKUP_FORMAT) throw new BackupError('Not an SA Copilot backup (unknown format)')
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupError('This backup was made by a newer version of SA Copilot — update the app first')
  }
  return manifest as BackupManifest
}

export function unpackBackup(data: Uint8Array): BackupContents & { warnings: string[] } {
  if (data.byteLength > MAX_BACKUP_BYTES) throw new BackupError('Backup is larger than 2 GB')
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        if (file.name.startsWith('files/') && file.originalSize > MAX_FILE_BYTES) throw new BackupError(`"${file.name.slice(6)}" is larger than 50 MB`)
        return !file.name.endsWith('/')
      },
    })
  } catch (e) {
    if (e instanceof BackupError) throw e
    throw new BackupError('Not a valid backup file (cannot read the zip)')
  }

  const manifest = readManifest(entries['manifest.json'])
  const known = new Set<string>(BACKUP_TABLES)
  const tables: BackupContents['tables'] = {}
  const files: BackupContents['files'] = {}
  const warnings: string[] = []

  for (const [name, bytes] of Object.entries(entries)) {
    if (name.startsWith('db/') && name.endsWith('.json')) {
      const table = name.slice(3, -5)
      let rows: unknown
      try {
        rows = JSON.parse(strFromU8(bytes))
      } catch {
        throw new BackupError(`${name} is not valid JSON`)
      }
      if (!Array.isArray(rows)) throw new BackupError(`${name} is not a list of rows`)
      if (!known.has(table)) warnings.push(`Skipped unknown table "${table}" (${rows.length} rows)`)
      else tables[table] = rows as Record<string, unknown>[]
    } else if (name.startsWith('files/')) {
      const file = name.slice(6)
      if (!isSafeFileName(file)) throw new BackupError(`Unsafe file name "${file}" in backup`)
      files[file] = bytes
    }
  }
  return { manifest, tables, files, warnings }
}
