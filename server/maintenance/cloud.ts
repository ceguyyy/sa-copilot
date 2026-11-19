import { queryOne } from '../db.ts'
import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import type { CloudStatus } from '../../shared/maintenance.ts'
import { config } from '../config.ts'
import { HttpError } from '../http.ts'
import { collectBackup, restoreBackup } from '../backup/service.ts'
import { BackupError, packBackup, unpackBackup } from '../backup/format.ts'
import { assembleBackup, fileHashes, packCloudSnapshot, readCloudSnapshot } from '../backup/cloudSnapshot.ts'
import { ensureBlobSchema, fetchBlobs, pruneBlobs, uploadBlobs } from './cloudBlobs.ts'
import { exclusive } from './lock.ts'
import { SUPABASE_CA } from './supabaseCa.ts'

const MAX_CLOUD_BYTES = 100 * 1024 * 1024
/**
 * Uploading or downloading a snapshot moves tens of MB in one query; on a slow connection that takes far longer
 * than the 60 s every other cloud query gets. Applied on the client (pg) and on the server (statement_timeout).
 */
export const SNAPSHOT_TIMEOUT_MS = 15 * 60_000

const snapshotQuery = (text: string, values: unknown[]) => ({ text, values, query_timeout: SNAPSHOT_TIMEOUT_MS })

/** Timeouts and dropped connections while moving a snapshot; anything else is a real bug and stays a 500. */
function isTransferFailure(e: unknown): boolean {
  const { code, message = '' } = e as { code?: string; message?: string }
  return code === '57014' || /Query read timeout|Connection terminated|ECONNRESET|ETIMEDOUT|EPIPE/i.test(message)
}

const UPLOAD_FAILED = 'Uploading to the cloud took too long or the connection dropped, so nothing was saved and the previous cloud backup is unchanged. Check your internet connection and try again.'
const DOWNLOAD_FAILED = 'Downloading from the cloud took too long or the connection dropped. Nothing was restored and your local data is unchanged. Check your internet connection and try again.'
interface DeviceState { device: string; revision: number; changeRevision?: number; syncedAt?: string }
async function localRevision() { return (await queryOne<{ revision: number }>('select revision from local_change_clock where id=1'))!.revision }
const stateFile = (workspace: string) => path.join(config.backupDir, `cloud-${createHash('sha256').update(`${config.cloud.databaseUrl}|${workspace}`).digest('hex').slice(0, 24)}.json`)

async function deviceState(workspace: string): Promise<DeviceState> {
  try { return JSON.parse(await readFile(stateFile(workspace), 'utf8')) } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    const state = { device: `${os.hostname()}-${randomUUID().slice(0, 8)}`, revision: 0 }
    await saveState(workspace, state)
    return state
  }
}
async function saveState(workspace: string, state: DeviceState) {
  await mkdir(config.backupDir, { recursive: true })
  const file = stateFile(workspace)
  const tmp = `${file}.${randomUUID()}.tmp`
  await writeFile(tmp, JSON.stringify(state), { mode: 0o600 })
  await rename(tmp, file)
}

export async function connectCloud(): Promise<pg.Client> {
  if (!config.cloud.databaseUrl) throw new HttpError(400, 'Set CLOUD_DATABASE_URL first')
  const url = new URL(config.cloud.databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new HttpError(400, 'Cloud connection must be a PostgreSQL URL')
  // Never allow the connection string to disable TLS or certificate verification.
  for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key)
  const supabaseHost = url.hostname.endsWith('.pooler.supabase.com') || url.hostname.endsWith('.supabase.co')
  const client = new pg.Client({ connectionString: url.toString(), ssl: {
    rejectUnauthorized: true,
    ...(supabaseHost ? { ca: SUPABASE_CA } : {}),
  }, connectionTimeoutMillis: 15_000, query_timeout: 60_000 })
  try { await client.connect(); return client } catch {
    await client.end().catch(() => {})
    throw new HttpError(502, 'Cannot connect to cloud database. Check the Supabase Session pooler URL, password, and TLS certificate.')
  }
}

export function assertRevision(local: number, remote: number) {
  if (local !== remote) throw new HttpError(409, 'Another computer has published data. Download cloud data first; save a local backup if you need to keep your changes.')
}

export async function cloudStatus(workspace: string): Promise<CloudStatus> {
  if (!config.cloud.databaseUrl) return { configured: false, workspace, device: os.hostname(), localRevision: 0, remoteRevision: 0 }
  const state = await deviceState(workspace)
  const changes = await localRevision()
  const client = await connectCloud()
  try {
    const { rows } = await client.query(`select w.revision, s.device, s.updated_at from sa_copilot_sync.workspaces w
      left join sa_copilot_sync.snapshots s on s.workspace_id = w.id and s.revision = w.revision where w.id = $1`, [workspace])
    return { configured: true, workspace, device: state.device, localRevision: state.revision,
      remoteRevision: rows[0]?.revision ?? 0, updatedAt: rows[0]?.updated_at?.toISOString(), updatedBy: rows[0]?.device, lastSyncedAt: state.syncedAt, localChanges: state.changeRevision === undefined ? undefined : changes !== state.changeRevision, localChangeStatus: state.changeRevision === undefined ? 'unknown' : changes !== state.changeRevision ? 'changed' : 'clean' }
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') throw new HttpError(400, 'Run db/supabase-sync.sql in your Supabase SQL editor first')
    throw e
  } finally { await client.end() }
}

/** What one upload sends: a small snapshot plus new files, or (without the file store) one full backup. */
function buildSnapshot(contents: Awaited<ReturnType<typeof collectBackup>>, useBlobs: boolean): { data: Uint8Array; hashes: Record<string, string> | null } {
  if (!useBlobs) return { data: packBackup(contents, config.appVersion).data, hashes: null }
  const hashes = fileHashes(contents.files)
  return { data: packCloudSnapshot(contents.tables, hashes, config.appVersion).data, hashes }
}

export async function pushCloud(workspace: string) {
  return exclusive(async () => {
    const state = await deviceState(workspace)
    const changeRevision = await localRevision()
    const contents = await collectBackup()
    const client = await connectCloud()
    try {
      // Ends with the connection, like everything set on this session.
      await client.query(`set statement_timeout = ${SNAPSHOT_TIMEOUT_MS}`)
      await client.query('insert into sa_copilot_sync.workspaces(id) values ($1) on conflict do nothing', [workspace])
      // Checked before sending any file, and again under the lock below.
      const current = await client.query('select revision from sa_copilot_sync.workspaces where id = $1', [workspace])
      assertRevision(state.revision, current.rows[0]?.revision ?? 0)
      const useBlobs = await ensureBlobSchema(client)
      const { data, hashes } = buildSnapshot(contents, useBlobs)
      if (data.byteLength > MAX_CLOUD_BYTES) throw new HttpError(413, 'Cloud snapshots are limited to 100 MB. Use the local backup for larger workspaces.')
      // New files go up first; until the snapshot below is committed nothing refers to them, so a failure here
      // leaves every existing snapshot exactly as it was.
      if (hashes) await uploadBlobs(client, workspace, contents.files, hashes, snapshotQuery)

      await client.query('begin')
      const { rows } = await client.query('select revision from sa_copilot_sync.workspaces where id = $1 for update', [workspace])
      assertRevision(state.revision, rows[0].revision)
      const revision = rows[0].revision + 1
      if (hashes) {
        await client.query(snapshotQuery('insert into sa_copilot_sync.snapshots(workspace_id, revision, device, data, blob_hashes) values ($1, $2, $3, $4, $5)',
          [workspace, revision, state.device, Buffer.from(data), [...new Set(Object.values(hashes))]]))
      } else {
        await client.query(snapshotQuery('insert into sa_copilot_sync.snapshots(workspace_id, revision, device, data) values ($1, $2, $3, $4)', [workspace, revision, state.device, Buffer.from(data)]))
      }
      await client.query('update sa_copilot_sync.workspaces set revision = $2 where id = $1', [workspace, revision])
      await client.query('delete from sa_copilot_sync.snapshots where workspace_id = $1 and revision <= $2', [workspace, revision - 10])
      if (useBlobs) await pruneBlobs(client, workspace)
      await client.query('commit')
      await saveState(workspace, { ...state, revision, changeRevision, syncedAt: new Date().toISOString() })
      return { revision }
    } catch (e) {
      // Nothing is committed before the final commit, so the earlier snapshots in the cloud are untouched.
      await client.query('rollback').catch(() => {})
      if (isTransferFailure(e)) {
        console.error('Cloud upload failed:', e)
        throw new HttpError(504, UPLOAD_FAILED)
      }
      throw e
    } finally { await client.end().catch(() => {}) }
  })
}

/** The full backup behind the current cloud revision, with every file checked against its hash. */
async function downloadSnapshot(client: pg.Client, workspace: string, expectedRevision: number): Promise<Uint8Array> {
  await client.query(`set statement_timeout = ${SNAPSHOT_TIMEOUT_MS}`)
  const { rows } = await client.query(snapshotQuery(`select s.data, w.revision from sa_copilot_sync.workspaces w
    join sa_copilot_sync.snapshots s on s.workspace_id = w.id and s.revision = w.revision where w.id = $1`, [workspace]))
  if (!rows.length) throw new HttpError(404, 'No cloud backup yet. Upload from your first computer.')
  if (rows[0].revision !== expectedRevision) throw new HttpError(409, 'Cloud changed. Refresh its status before downloading.')
  const raw = new Uint8Array(rows[0].data)
  if (raw.byteLength > MAX_CLOUD_BYTES) throw new HttpError(413, 'Cloud snapshot is too large')
  const snapshot = readCloudSnapshot(raw)
  if (snapshot.kind === 'full') return snapshot.data
  return assembleBackup(snapshot, await fetchBlobs(client, workspace, snapshot.files, snapshotQuery))
}

export async function pullCloud(expectedRevision: number, workspace: string) {
  return exclusive(async () => {
    const state = await deviceState(workspace)
    const client = await connectCloud()
    let data: Uint8Array
    try {
      data = await downloadSnapshot(client, workspace, expectedRevision)
    } catch (e) {
      if (isTransferFailure(e)) {
        console.error('Cloud download failed:', e)
        throw new HttpError(504, DOWNLOAD_FAILED)
      }
      if (e instanceof BackupError) throw new HttpError(502, e.message)
      throw e
    } finally { await client.end().catch(() => {}) }
    // Validated in full before restoreBackup touches anything; restoreBackup saves a safety backup first.
    unpackBackup(data)
    const result = await restoreBackup(data)
    await saveState(workspace, { ...state, revision: expectedRevision, changeRevision: await localRevision(), syncedAt: new Date().toISOString() })
    return { revision: expectedRevision, safetyBackup: result.safetyBackup }
  })
}
