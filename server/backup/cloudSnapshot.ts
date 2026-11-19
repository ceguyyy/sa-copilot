// Cloud snapshots without the upload files: the tables plus a name → SHA-256 list. The file bytes are stored once
// per workspace in sa_copilot_sync.blobs, so a new revision only uploads files the cloud does not have yet.
// formatVersion 2 makes older app versions refuse the snapshot instead of restoring it without its files.
import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { BACKUP_FORMAT, BackupError, isSafeFileName, packBackup, type BackupManifest } from './format.ts'

export const CLOUD_SNAPSHOT_VERSION = 2
const FILES_ENTRY = 'blobs.json'
const HASH_RE = /^[0-9a-f]{64}$/

type Tables = Record<string, Record<string, unknown>[]>
export type CloudManifest = Omit<BackupManifest, 'formatVersion'> & { formatVersion: typeof CLOUD_SNAPSHOT_VERSION }
export type CloudSnapshot =
  | { kind: 'full'; data: Uint8Array }
  | { kind: 'blobs'; manifest: CloudManifest; tables: Tables; files: Record<string, string> }

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export function fileHashes(files: Record<string, Uint8Array>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha256(bytes)]))
}

function checkFiles(files: Record<string, string>) {
  for (const [name, hash] of Object.entries(files)) {
    if (!isSafeFileName(name)) throw new BackupError(`Unsafe file name "${name}"`)
    if (!HASH_RE.test(hash)) throw new BackupError(`Invalid file hash for "${name}"`)
  }
}

export function packCloudSnapshot(tables: Tables, files: Record<string, string>, appVersion: string, now = new Date()): { data: Uint8Array; manifest: CloudManifest } {
  checkFiles(files)
  const manifest: CloudManifest = {
    format: BACKUP_FORMAT,
    formatVersion: CLOUD_SNAPSHOT_VERSION,
    appVersion,
    createdAt: now.toISOString(),
    tables: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])),
    files: Object.keys(files).length,
  }
  const zip: Zippable = { 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)), [FILES_ENTRY]: strToU8(JSON.stringify(files)) }
  for (const [table, rows] of Object.entries(tables)) zip[`db/${table}.json`] = strToU8(JSON.stringify(rows))
  return { data: zipSync(zip, { level: 6 }), manifest }
}

function json(bytes: Uint8Array | undefined, name: string): unknown {
  if (!bytes) throw new BackupError(`Cloud snapshot is missing ${name}`)
  try {
    return JSON.parse(strFromU8(bytes))
  } catch {
    throw new BackupError(`${name} in the cloud snapshot is not valid JSON`)
  }
}

/** A full backup (older snapshots) is returned as is; a v2 snapshot is unpacked into tables and file hashes. */
export function readCloudSnapshot(data: Uint8Array): CloudSnapshot {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(data, { filter: (f) => !f.name.startsWith('files/') })
  } catch {
    throw new BackupError('Cloud snapshot is not a valid zip')
  }
  const manifest = json(entries['manifest.json'], 'manifest.json') as Partial<CloudManifest>
  if (manifest.format !== BACKUP_FORMAT) throw new BackupError('Not an SA Copilot cloud snapshot')
  if (manifest.formatVersion !== CLOUD_SNAPSHOT_VERSION) {
    if (typeof manifest.formatVersion === 'number' && manifest.formatVersion < CLOUD_SNAPSHOT_VERSION) return { kind: 'full', data }
    throw new BackupError('This cloud backup was made by a newer version of SA Copilot — update the app first')
  }
  const files = json(entries[FILES_ENTRY], FILES_ENTRY) as Record<string, string>
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new BackupError(`${FILES_ENTRY} must be an object`)
  checkFiles(files)
  const tables: Tables = {}
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith('db/') || !name.endsWith('.json')) continue
    const rows = json(bytes, name)
    if (!Array.isArray(rows)) throw new BackupError(`${name} is not a list of rows`)
    tables[name.slice(3, -5)] = rows as Tables[string]
  }
  return { kind: 'blobs', manifest: manifest as CloudManifest, tables, files }
}

/** The full backup to restore; every file must be present with exactly the bytes its hash promises. */
export function assembleBackup(snapshot: Extract<CloudSnapshot, { kind: 'blobs' }>, blobs: Map<string, Uint8Array>): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  for (const [name, hash] of Object.entries(snapshot.files)) {
    const bytes = blobs.get(hash)
    if (!bytes || sha256(bytes) !== hash) throw new BackupError(`The cloud copy of "${name}" is missing or damaged. Nothing was restored.`)
    files[name] = bytes
  }
  return packBackup({ tables: snapshot.tables, files }, snapshot.manifest.appVersion, new Date(snapshot.manifest.createdAt)).data
}
