// Upload files stored once per workspace in the cloud, keyed by SHA-256, so each backup revision only sends new
// files. Blobs are immutable; a blob is deleted only when no kept snapshot uses it and it was not touched for a day.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type pg from 'pg'
import { config } from '../config.ts'
import { sha256 } from '../backup/cloudSnapshot.ts'

/** A blob untouched this long and used by no kept snapshot may go; far longer than any upload takes. */
export const BLOB_GRACE = '1 day'

type Query = (text: string, values: unknown[]) => { text: string; values: unknown[]; query_timeout: number }

/** Creates the blob table and snapshot column once. False when the role may not, so the caller uploads a full snapshot. */
export async function ensureBlobSchema(client: pg.Client): Promise<boolean> {
  const { rows } = await client.query(`select to_regclass('sa_copilot_sync.blobs') is not null as has_blobs,
    exists (select 1 from information_schema.columns where table_schema = 'sa_copilot_sync' and table_name = 'snapshots' and column_name = 'blob_hashes') as has_column`)
  if (rows[0]?.has_blobs && rows[0]?.has_column) return true
  try {
    await client.query(`create table if not exists sa_copilot_sync.blobs (
      workspace_id text not null references sa_copilot_sync.workspaces(id),
      hash text not null,
      size integer not null,
      data bytea not null,
      created_at timestamptz not null default now(),
      primary key (workspace_id, hash)
    )`)
    await client.query('alter table sa_copilot_sync.snapshots add column if not exists blob_hashes text[]')
    await client.query('revoke all on sa_copilot_sync.blobs from public, anon, authenticated')
    return true
  } catch (e) {
    console.error('Cloud file store unavailable, uploading a full snapshot instead:', e)
    return false
  }
}

/**
 * Sends the files the cloud does not have yet. Files it already has are touched so a concurrent prune from
 * another computer cannot remove them before this snapshot is committed.
 */
export async function uploadBlobs(client: pg.Client, workspace: string, files: Record<string, Uint8Array>, hashes: Record<string, string>, query: Query): Promise<number> {
  const unique = new Map(Object.entries(files).map(([name, bytes]) => [hashes[name], bytes]))
  const { rows } = await client.query('update sa_copilot_sync.blobs set created_at = now() where workspace_id = $1 and hash = any($2) returning hash', [workspace, [...unique.keys()]])
  const existing = new Set((rows as { hash: string }[]).map((r) => r.hash))
  let sent = 0
  for (const [hash, bytes] of unique) {
    if (existing.has(hash)) continue
    await client.query(query('insert into sa_copilot_sync.blobs(workspace_id, hash, size, data) values ($1, $2, $3, $4) on conflict (workspace_id, hash) do update set created_at = now()', [workspace, hash, bytes.byteLength, Buffer.from(bytes)]))
    sent++
  }
  return sent
}

/** Inside the snapshot transaction: drops blobs no kept snapshot uses any more (after the grace period). */
export async function pruneBlobs(client: pg.Client, workspace: string): Promise<void> {
  await client.query(`delete from sa_copilot_sync.blobs b where b.workspace_id = $1 and b.created_at < now() - interval '${BLOB_GRACE}'
    and not exists (select 1 from sa_copilot_sync.snapshots s where s.workspace_id = $1 and b.hash = any(s.blob_hashes))`, [workspace])
}

/** Local upload files that already have the right bytes, so they are not downloaded again. */
async function localCopies(files: Record<string, string>): Promise<Map<string, Uint8Array>> {
  const found = new Map<string, Uint8Array>()
  for (const [name, hash] of Object.entries(files)) {
    const bytes = await readFile(path.join(config.uploadDir, name)).catch(() => null)
    if (bytes && sha256(bytes) === hash) found.set(hash, bytes)
  }
  return found
}

/** Every blob a snapshot needs: local copies first, the rest from the cloud. Hashes are checked by the caller. */
export async function fetchBlobs(client: pg.Client, workspace: string, files: Record<string, string>, query: Query): Promise<Map<string, Uint8Array>> {
  const blobs = await localCopies(files)
  const missing = [...new Set(Object.values(files))].filter((h) => !blobs.has(h))
  if (!missing.length) return blobs
  const { rows } = await client.query(query('select hash, data from sa_copilot_sync.blobs where workspace_id = $1 and hash = any($2)', [workspace, missing]))
  for (const row of rows as { hash: string; data: Buffer }[]) blobs.set(row.hash, new Uint8Array(row.data))
  return blobs
}
