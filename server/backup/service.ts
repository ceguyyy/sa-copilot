// Backup = every table + the upload files the database references; Restore = replace them all in one transaction.
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type pg from 'pg'
import { config } from '../config.ts'
import { applySchema, query, withTransaction } from '../db.ts'
import { HttpError } from '../http.ts'
import { BACKUP_TABLES, isSafeFileName, packBackup, unpackBackup, type BackupManifest } from './format.ts'

const INSERT_CHUNK = 500

/**
 * Upload files the database points at. Only these are backed up and replaced on restore: the upload folder
 * may be shared with other things (exports, templates) that must never be read into a backup or deleted.
 */
async function uploadKeys(): Promise<string[]> {
  const rows = await query<{ key: string }>(
    `select storage_path as key from sources where storage_path is not null
     union select storage_path from attachments`,
  )
  return rows.map((r) => r.key).filter(isSafeFileName)
}

async function isFile(file: string): Promise<boolean> {
  return (await stat(file).catch(() => null))?.isFile() ?? false
}

export async function createBackup(): Promise<{ data: Uint8Array; manifest: BackupManifest }> {
  const tables: Record<string, Record<string, unknown>[]> = {}
  await withTransaction(async (tx) => {
    await tx.query('set transaction isolation level repeatable read read only')
    for (const table of BACKUP_TABLES) tables[table] = (await tx.query(`select * from ${table}`)).rows
  })
  const files: Record<string, Uint8Array> = {}
  const keys = [...new Set([...(tables.sources ?? []), ...(tables.attachments ?? [])]
    .map((row) => row.storage_path).filter((key): key is string => typeof key === 'string' && isSafeFileName(key)))]
  for (const key of keys) {
    const file = path.join(config.uploadDir, key)
    if (await isFile(file)) files[key] = await readFile(file)
  }
  return packBackup({ tables, files }, config.appVersion)
}

export function summarize(manifest: BackupManifest): { projects: number; documents: number; files: number } {
  return { projects: manifest.tables.projects ?? 0, documents: manifest.tables.documents ?? 0, files: manifest.files }
}

async function tableColumns(tx: pg.PoolClient, table: string): Promise<Set<string>> {
  const { rows } = await tx.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table],
  )
  return new Set(rows.map((r) => r.column_name))
}

async function insertRows(tx: pg.PoolClient, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return
  const existing = await tableColumns(tx, table)
  // Only columns both the backup and this schema know; the rest get their column defaults.
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => existing.has(c))
  if (!columns.length) return
  const list = columns.map((c) => `"${c}"`).join(', ')
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await tx.query(`insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json)`, [
      JSON.stringify(rows.slice(i, i + INSERT_CHUNK)),
    ])
  }
}

export async function restoreBackup(data: Uint8Array): Promise<{ manifest: BackupManifest; warnings: string[]; safetyBackup: string }> {
  const contents = unpackBackup(data) // validates before anything is touched

  const previousKeys = await uploadKeys()
  const current = await createBackup()
  await mkdir(config.backupDir, { recursive: true })
  const safetyBackup = path.join(config.backupDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.sacopilot`)
  await writeFile(safetyBackup, current.data)

  try {
    await withTransaction(async (tx) => {
      // Replica mode: no triggers (audit log, version numbering) and no FK checks while rows are re-inserted.
      await tx.query('set local session_replication_role = replica')
      await tx.query(`truncate table ${BACKUP_TABLES.join(', ')} cascade`)
      for (const table of BACKUP_TABLES) await insertRows(tx, table, contents.tables[table] ?? [])
    })
  } catch (e) {
    if ((e as { code?: string }).code === '42501') throw new HttpError(500, 'Restore needs a superuser database role (session_replication_role)')
    throw e
  }
  await applySchema()
  await query('update local_change_clock set revision=revision+1,changed_at=clock_timestamp() where id=1')

  for (const key of previousKeys) {
    if (key in contents.files) continue
    await unlink(path.join(config.uploadDir, key)).catch((e) => {
      if ((e as { code?: string }).code !== 'ENOENT') throw e
    })
  }
  await mkdir(config.uploadDir, { recursive: true })
  for (const [name, bytes] of Object.entries(contents.files)) await writeFile(path.join(config.uploadDir, name), bytes)

  return { manifest: contents.manifest, warnings: contents.warnings, safetyBackup }
}
