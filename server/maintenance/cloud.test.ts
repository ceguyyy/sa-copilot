import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { strToU8 } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn(), collect: vi.fn(), restore: vi.fn(), clientOptions: vi.fn() }))
vi.mock('../db.ts', () => ({ queryOne: async () => ({ revision: 0 }) }))
vi.mock('pg', () => ({ default: { Client: class {
  constructor(options: unknown) { mocks.clientOptions(options) }
  connect = mocks.connect
  query = mocks.query
  end = mocks.end
} } }))
vi.mock('../config.ts', () => ({ config: {
  backupDir: mkdtempSync(path.join(tmpdir(), 'sa-cloud-test-')),
  uploadDir: mkdtempSync(path.join(tmpdir(), 'sa-cloud-uploads-')),
  appVersion: '2.1.1',
  cloud: { databaseUrl: 'postgresql://postgres:fake@localhost:5432/postgres', workspace: 'tests' },
} }))
vi.mock('../backup/service.ts', () => ({ collectBackup: mocks.collect, restoreBackup: mocks.restore }))
import { SNAPSHOT_TIMEOUT_MS, assertRevision, cloudStatus, pullCloud, pushCloud } from './cloud.ts'
import { config } from '../config.ts'
import { packBackup, unpackBackup } from '../backup/format.ts'
import { readCloudSnapshot, sha256 } from '../backup/cloudSnapshot.ts'

/** SQL text of a mocked query call, whether it was sent as a string or as a query config. */
const sqlOf = (q: unknown) => (typeof q === 'string' ? q : (q as { text: string }).text)
const valuesOf = (q: unknown, values?: unknown[]) => (typeof q === 'string' ? values ?? [] : (q as { values: unknown[] }).values)
const DAY = 24 * 60 * 60 * 1000

type Snapshot = { ws: string; revision: number; data: Buffer; blobHashes: string[] | null }
type Blob = { data: Buffer; touchedAt: number }

/** A small in-memory stand-in for the sa_copilot_sync schema, with transactions that really roll back. */
function fakeCloud() {
  const db = { workspaces: new Map<string, number>(), snapshots: [] as Snapshot[], blobs: new Map<string, Blob>(), blobSchema: false }
  let saved: typeof db | null = null
  const opts = { failDdl: false, failOn: null as null | 'blob' | 'snapshot', error: new Error('Query read timeout') as Error }
  const clone = () => ({ ...db, workspaces: new Map(db.workspaces), snapshots: [...db.snapshots], blobs: new Map(db.blobs) })
  const handle = async (q: unknown, params?: unknown[]) => {
    const sql = sqlOf(q).replace(/\s+/g, ' ').trim()
    const v = valuesOf(q, params)
    const ws = v[0] as string
    if (sql.startsWith('set ') || sql.startsWith('revoke') || sql.startsWith('alter table')) return { rows: [] }
    if (sql === 'begin') { saved = clone(); return { rows: [] } }
    if (sql === 'commit') { saved = null; return { rows: [] } }
    if (sql === 'rollback') { if (saved) Object.assign(db, saved); saved = null; return { rows: [] } }
    if (sql.startsWith('select to_regclass')) return { rows: [{ has_blobs: db.blobSchema, has_column: db.blobSchema }] }
    if (sql.startsWith('create table')) { if (opts.failDdl) throw Object.assign(new Error('permission denied for schema'), { code: '42501' }); db.blobSchema = true; return { rows: [] } }
    if (sql.startsWith('insert into sa_copilot_sync.workspaces')) { if (!db.workspaces.has(ws)) db.workspaces.set(ws, 0); return { rows: [] } }
    if (sql.startsWith('select revision from sa_copilot_sync.workspaces')) return { rows: db.workspaces.has(ws) ? [{ revision: db.workspaces.get(ws) }] : [] }
    if (sql.startsWith('update sa_copilot_sync.blobs set created_at')) {
      const hit = (v[1] as string[]).filter((h) => db.blobs.has(`${ws}|${h}`))
      for (const h of hit) db.blobs.set(`${ws}|${h}`, { ...db.blobs.get(`${ws}|${h}`)!, touchedAt: Date.now() })
      return { rows: hit.map((hash) => ({ hash })) }
    }
    if (sql.startsWith('insert into sa_copilot_sync.blobs')) {
      if (opts.failOn === 'blob') throw opts.error
      db.blobs.set(`${ws}|${v[1]}`, { data: v[3] as Buffer, touchedAt: Date.now() })
      return { rows: [] }
    }
    if (sql.startsWith('insert into sa_copilot_sync.snapshots')) {
      if (opts.failOn === 'snapshot') throw opts.error
      db.snapshots.push({ ws, revision: v[1] as number, data: v[3] as Buffer, blobHashes: (v[4] as string[] | undefined) ?? null })
      return { rows: [] }
    }
    if (sql.startsWith('update sa_copilot_sync.workspaces set revision')) { db.workspaces.set(ws, v[1] as number); return { rows: [] } }
    if (sql.startsWith('delete from sa_copilot_sync.snapshots')) { db.snapshots = db.snapshots.filter((s) => s.ws !== ws || s.revision > (v[1] as number)); return { rows: [] } }
    if (sql.startsWith('delete from sa_copilot_sync.blobs')) {
      for (const [key, blob] of db.blobs) {
        const [owner, hash] = key.split('|')
        const used = db.snapshots.some((s) => s.ws === owner && s.blobHashes?.includes(hash))
        if (owner === ws && !used && blob.touchedAt < Date.now() - DAY) db.blobs.delete(key)
      }
      return { rows: [] }
    }
    if (sql.startsWith('select s.data, w.revision')) {
      const rev = db.workspaces.get(ws)
      const snap = db.snapshots.find((s) => s.ws === ws && s.revision === rev)
      return { rows: snap ? [{ revision: rev, data: snap.data }] : [] }
    }
    if (sql.startsWith('select hash, data from sa_copilot_sync.blobs')) {
      return { rows: (v[1] as string[]).filter((h) => db.blobs.has(`${ws}|${h}`)).map((hash) => ({ hash, data: db.blobs.get(`${ws}|${hash}`)!.data })) }
    }
    if (sql.startsWith('select w.revision, s.device')) return { rows: db.workspaces.has(ws) ? [{ revision: db.workspaces.get(ws), device: 'pc', updated_at: new Date() }] : [] }
    throw new Error(`fake cloud: unexpected query ${sql}`)
  }
  return { db, opts, handle }
}

let cloud: ReturnType<typeof fakeCloud>
let n = 0
const uniqueWs = () => `ws-${++n}`
const contents = (files: Record<string, string>) => ({ tables: { projects: [{ id: 'p1', name: 'Xhealth' }] }, files: Object.fromEntries(Object.entries(files).map(([k, s]) => [k, strToU8(s)])) })
const blobUploads = () => mocks.query.mock.calls.filter(([q]) => sqlOf(q).startsWith('insert into sa_copilot_sync.blobs'))
const restoredFiles = () => {
  const data = mocks.restore.mock.calls.at(-1)![0] as Uint8Array
  return Object.fromEntries(Object.entries(unpackBackup(data).files).map(([k, b]) => [k, new TextDecoder().decode(b)]))
}

beforeEach(() => {
  vi.clearAllMocks()
  config.cloud.databaseUrl = 'postgresql://postgres:fake@localhost:5432/postgres'
  cloud = fakeCloud()
  mocks.connect.mockResolvedValue(undefined)
  mocks.end.mockResolvedValue(undefined)
  mocks.query.mockImplementation(cloud.handle)
  mocks.collect.mockResolvedValue(contents({ 'a-Brief.pdf': '%PDF-brief' }))
  mocks.restore.mockResolvedValue({ safetyBackup: 'safe.sacopilot' })
})

describe('cloud conflict and restore protection', () => {
  it('scopes every cloud status query to the supplied account workspace', async () => {
    await cloudStatus('account:user-a')
    await cloudStatus('account:user-b')
    const queries = mocks.query.mock.calls.filter(([sql]) => sqlOf(sql).includes('where w.id'))
    expect(queries.map(([, params]) => params)).toEqual([['account:user-a'], ['account:user-b']])
  })
  it('uploads and restores only the supplied account, with independent device revisions', async () => {
    await expect(pushCloud('account:owner-a')).resolves.toEqual({ revision: 1 })
    expect(cloud.db.snapshots.map((s) => s.ws)).toEqual(['account:owner-a'])
    cloud.db.workspaces.set('account:owner-b', 7)
    cloud.db.snapshots.push({ ws: 'account:owner-b', revision: 7, data: Buffer.from(packBackup(contents({}), '2.0.0').data), blobHashes: null })
    await expect(pullCloud(7, 'account:owner-b')).resolves.toMatchObject({ revision: 7 })
    expect((await cloudStatus('account:owner-a')).localRevision).toBe(1)
    expect((await cloudStatus('account:owner-b')).localRevision).toBe(7)
  })
  it('trusts the official Supabase CA while retaining TLS verification and stripping unsafe URL overrides', async () => {
    config.cloud.databaseUrl = 'postgresql://postgres:fake@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify'
    await cloudStatus('tests')
    expect(mocks.clientOptions).toHaveBeenCalledWith(expect.objectContaining({
      ssl: { rejectUnauthorized: true, ca: expect.stringContaining('-----BEGIN CERTIFICATE-----') },
      connectionString: expect.not.stringContaining('sslmode'),
    }))
  })
  it('uses normal verified TLS for other PostgreSQL hosts', async () => {
    await cloudStatus('tests')
    expect(mocks.clientOptions).toHaveBeenCalledWith(expect.objectContaining({ ssl: { rejectUnauthorized: true } }))
  })
  it('rejects stale revisions instead of silently overwriting another computer', () => {
    expect(() => assertRevision(2, 3)).toThrow('Another computer')
    expect(() => assertRevision(3, 3)).not.toThrow()
  })
  it('rejects a stale upload before sending any file and does not insert a snapshot', async () => {
    const ws = uniqueWs()
    cloud.db.workspaces.set(ws, 8)
    await expect(pushCloud(ws)).rejects.toThrow('Another computer')
    expect(blobUploads()).toHaveLength(0)
    expect(cloud.db.snapshots).toHaveLength(0)
    expect(mocks.end).toHaveBeenCalled()
  })
  it('does not restore if the cloud changed since the preview', async () => {
    const ws = uniqueWs()
    await pushCloud(ws)
    await expect(pullCloud(4, ws)).rejects.toThrow('Cloud changed')
    expect(mocks.restore).not.toHaveBeenCalled()
  })
  it('validates cloud data before invoking the existing safety-backup restore', async () => {
    const ws = uniqueWs()
    cloud.db.workspaces.set(ws, 2)
    cloud.db.snapshots.push({ ws, revision: 2, data: Buffer.from('not a backup'), blobHashes: null })
    await expect(pullCloud(2, ws)).rejects.toMatchObject({ status: 502 })
    expect(mocks.restore).not.toHaveBeenCalled()
  })
  it('restores a snapshot and records the device revision', async () => {
    const ws = uniqueWs()
    await pushCloud(ws)
    await expect(pullCloud(1, ws)).resolves.toEqual({ revision: 1, safetyBackup: 'safe.sacopilot' })
    expect((await cloudStatus(ws)).localRevision).toBe(1)
  })
  it('commits the next revision and retains ten remote snapshots', async () => {
    const ws = uniqueWs()
    for (let i = 0; i < 12; i++) await pushCloud(ws)
    expect(cloud.db.workspaces.get(ws)).toBe(12)
    expect(cloud.db.snapshots.map((s) => s.revision)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })
})

describe('files are uploaded once', () => {
  it('sends each file once and keeps file bytes out of the snapshot', async () => {
    const ws = uniqueWs()
    mocks.collect.mockResolvedValue(contents({ 'a-Brief.pdf': '%PDF-brief', 'b-Deck.pdf': '%PDF-deck', 'c-Copy.pdf': '%PDF-brief' }))
    await pushCloud(ws)
    expect(blobUploads()).toHaveLength(2) // identical files share one blob
    const snap = readCloudSnapshot(cloud.db.snapshots[0].data)
    expect(snap.kind).toBe('blobs')
    expect(snap.kind === 'blobs' && Object.keys(snap.files).sort()).toEqual(['a-Brief.pdf', 'b-Deck.pdf', 'c-Copy.pdf'])
  })

  it('sends only new or changed files on the next upload', async () => {
    const ws = uniqueWs()
    mocks.collect.mockResolvedValue(contents({ 'a-Brief.pdf': '%PDF-brief', 'b-Deck.pdf': '%PDF-deck' }))
    await pushCloud(ws)
    mocks.query.mockClear()
    await pushCloud(ws)
    expect(blobUploads()).toHaveLength(0)
    mocks.collect.mockResolvedValue(contents({ 'a-Brief.pdf': '%PDF-brief', 'b-Deck.pdf': '%PDF-deck v2' }))
    mocks.query.mockClear()
    await pushCloud(ws)
    expect(blobUploads().map(([q]) => valuesOf(q)[1])).toEqual([sha256(strToU8('%PDF-deck v2'))])
  })

  it('restores the full backup from the blobs, reusing local files that already match', async () => {
    const ws = uniqueWs()
    mocks.collect.mockResolvedValue(contents({ 'a-Brief.pdf': '%PDF-brief', 'b-Deck.pdf': '%PDF-deck' }))
    await pushCloud(ws)
    writeFileSync(path.join(config.uploadDir, 'a-Brief.pdf'), '%PDF-brief')
    mocks.query.mockClear()
    await pullCloud(1, ws)
    expect(restoredFiles()).toEqual({ 'a-Brief.pdf': '%PDF-brief', 'b-Deck.pdf': '%PDF-deck' })
    const fetched = mocks.query.mock.calls.find(([q]) => sqlOf(q).startsWith('select hash, data'))![0]
    expect(valuesOf(fetched)[1]).toEqual([sha256(strToU8('%PDF-deck'))])
  })

  it('restores nothing when a file is missing from the cloud', async () => {
    const ws = uniqueWs()
    mocks.collect.mockResolvedValue(contents({ 'z-Only-in-cloud.pdf': '%PDF-z' }))
    await pushCloud(ws)
    cloud.db.blobs.clear()
    await expect(pullCloud(1, ws)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('Nothing was restored') })
    expect(mocks.restore).not.toHaveBeenCalled()
  })

  it('still restores older full snapshots', async () => {
    const ws = uniqueWs()
    cloud.db.workspaces.set(ws, 3)
    cloud.db.snapshots.push({ ws, revision: 3, data: Buffer.from(packBackup(contents({ 'old.pdf': '%PDF-old' }), '2.0.0').data), blobHashes: null })
    await pullCloud(3, ws)
    expect(restoredFiles()).toEqual({ 'old.pdf': '%PDF-old' })
  })

  it('falls back to a full snapshot when the file store cannot be created', async () => {
    const ws = uniqueWs()
    cloud.opts.failDdl = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await pushCloud(ws)
    expect(blobUploads()).toHaveLength(0)
    expect(readCloudSnapshot(cloud.db.snapshots[0].data).kind).toBe('full')
    await pullCloud(1, ws)
    expect(restoredFiles()).toEqual({ 'a-Brief.pdf': '%PDF-brief' })
  })

  it('removes only blobs no kept snapshot uses and that were not touched for a day', async () => {
    const ws = uniqueWs()
    mocks.collect.mockResolvedValue(contents({ 'a-Brief.pdf': '%PDF-brief' }))
    await pushCloud(ws)
    cloud.db.blobs.set(`${ws}|${'0'.repeat(64)}`, { data: Buffer.from('orphan, old'), touchedAt: Date.now() - 2 * DAY })
    cloud.db.blobs.set(`${ws}|${'1'.repeat(64)}`, { data: Buffer.from('orphan, fresh — another computer is mid-upload'), touchedAt: Date.now() })
    await pushCloud(ws)
    expect([...cloud.db.blobs.keys()].map((k) => k.split('|')[1]).sort()).toEqual(['1'.repeat(64), sha256(strToU8('%PDF-brief'))].sort())
  })
})

describe('large snapshots', () => {
  it('gives the snapshot upload its own long timeout, on the client and on the server', async () => {
    await pushCloud(uniqueWs())
    const insert = mocks.query.mock.calls.find(([q]) => sqlOf(q).startsWith('insert into sa_copilot_sync.snapshots'))?.[0]
    expect(insert).toMatchObject({ query_timeout: SNAPSHOT_TIMEOUT_MS })
    expect(blobUploads()[0][0]).toMatchObject({ query_timeout: SNAPSHOT_TIMEOUT_MS })
    expect(SNAPSHOT_TIMEOUT_MS).toBeGreaterThanOrEqual(10 * 60_000)
    expect(mocks.query).toHaveBeenCalledWith(`set statement_timeout = ${SNAPSHOT_TIMEOUT_MS}`)
  })

  for (const failOn of ['blob', 'snapshot'] as const) {
    it(`keeps the previous cloud backup and the device revision when the ${failOn} upload times out`, async () => {
      const ws = uniqueWs()
      await pushCloud(ws)
      const before = cloud.db.snapshots.map((s) => s.revision)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      cloud.opts.failOn = failOn
      mocks.collect.mockResolvedValue(contents({ 'a-Brief.pdf': '%PDF-brief', 'new.pdf': '%PDF-new' }))
      await expect(pushCloud(ws)).rejects.toMatchObject({ status: 504, message: expect.stringContaining('previous cloud backup is unchanged') })
      expect(cloud.db.workspaces.get(ws)).toBe(1)
      expect(cloud.db.snapshots.map((s) => s.revision)).toEqual(before)
      // The previous backup is still complete and restorable.
      cloud.opts.failOn = null
      await pullCloud(1, ws)
      expect(restoredFiles()).toEqual({ 'a-Brief.pdf': '%PDF-brief' })
      // And the retry continues from the same revision.
      await expect(pushCloud(ws)).resolves.toEqual({ revision: 2 })
    })
  }

  it('reports a server-side statement timeout or dropped connection the same way', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const error of [Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }), new Error('Connection terminated unexpectedly')]) {
      cloud.opts.failOn = 'snapshot'
      cloud.opts.error = error
      await expect(pushCloud(uniqueWs())).rejects.toMatchObject({ message: expect.stringContaining('previous cloud backup is unchanged') })
    }
  })

  it('downloads the snapshot and its files with the long timeout too', async () => {
    const ws = uniqueWs()
    mocks.collect.mockResolvedValue(contents({ 'not-local.pdf': '%PDF-only-in-cloud' }))
    await pushCloud(ws)
    mocks.query.mockClear()
    await pullCloud(1, ws)
    const longQueries = mocks.query.mock.calls.filter(([q]) => typeof q !== 'string').map(([q]) => q)
    expect(longQueries.length).toBe(2)
    for (const q of longQueries) expect(q).toMatchObject({ query_timeout: SNAPSHOT_TIMEOUT_MS })
  })

  it('explains a timed-out download without restoring anything', async () => {
    const ws = uniqueWs()
    await pushCloud(ws)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.query.mockImplementation(async (q: unknown, p?: unknown[]) => {
      if (sqlOf(q).startsWith('select s.data')) throw new Error('Query read timeout')
      return cloud.handle(q, p)
    })
    await expect(pullCloud(1, ws)).rejects.toMatchObject({ status: 504, message: expect.stringContaining('local data is unchanged') })
    expect(mocks.restore).not.toHaveBeenCalled()
  })
})
