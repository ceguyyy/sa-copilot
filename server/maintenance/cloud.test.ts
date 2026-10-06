import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn(), backup: vi.fn(), restore: vi.fn(), validate: vi.fn(), clientOptions: vi.fn() }))
vi.mock('../db.ts', () => ({ queryOne: async () => ({ revision: 0 }) }))
vi.mock('pg', () => ({ default: { Client: class {
  constructor(options: unknown) { mocks.clientOptions(options) }
  connect = mocks.connect
  query = mocks.query
  end = mocks.end
} } }))
vi.mock('../config.ts', () => ({ config: { backupDir: mkdtempSync(path.join(tmpdir(), 'sa-cloud-test-')),
  cloud: { databaseUrl: 'postgresql://postgres:fake@localhost:5432/postgres', workspace: 'tests' } } }))
vi.mock('../backup/service.ts', () => ({ createBackup: mocks.backup, restoreBackup: mocks.restore }))
vi.mock('../backup/format.ts', () => ({ unpackBackup: mocks.validate }))
import { assertRevision, cloudStatus, pullCloud, pushCloud } from './cloud.ts'
import { config } from '../config.ts'

beforeEach(() => {
  vi.clearAllMocks()
  config.cloud.databaseUrl = 'postgresql://postgres:fake@localhost:5432/postgres'
  mocks.connect.mockResolvedValue(undefined)
  mocks.end.mockResolvedValue(undefined)
  mocks.query.mockResolvedValue({ rows: [] })
  mocks.backup.mockResolvedValue({ data: new Uint8Array([1, 2]) })
  mocks.restore.mockResolvedValue({ safetyBackup: 'safe.sacopilot' })
})

describe('cloud conflict and restore protection', () => {
  it('scopes every cloud status query to the supplied account workspace', async () => {
    await cloudStatus('account:user-a')
    await cloudStatus('account:user-b')
    const queries = mocks.query.mock.calls.filter(([sql]) => sql.includes('where w.id'))
    expect(queries.map(([, params]) => params)).toEqual([['account:user-a'], ['account:user-b']])
  })
  it('uploads and restores only the supplied account, with independent device revisions', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('for update') ? [{ revision: 0 }] : [] }))
    await expect(pushCloud('account:owner-a')).resolves.toEqual({ revision: 1 })
    expect(mocks.query).toHaveBeenCalledWith('insert into sa_copilot_sync.snapshots(workspace_id, revision, device, data) values ($1, $2, $3, $4)',
      ['account:owner-a', 1, expect.any(String), expect.any(Buffer)])
    mocks.query.mockResolvedValue({ rows: [{ revision: 7, data: Buffer.from('backup') }] })
    await expect(pullCloud(7, 'account:owner-b')).resolves.toMatchObject({ revision: 7 })
    mocks.query.mockResolvedValue({ rows: [{ revision: 1 }] })
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
  it('rolls back a stale upload and does not insert a snapshot', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('for update') ? [{ revision: 8 }] : [] }))
    await expect(pushCloud('tests')).rejects.toThrow('Another computer')
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('insert into sa_copilot_sync.snapshots'))).toBe(false)
    expect(mocks.query).toHaveBeenCalledWith('rollback')
    expect(mocks.end).toHaveBeenCalled()
  })
  it('does not restore if the cloud changed since the preview', async () => {
    mocks.query.mockResolvedValue({ rows: [{ revision: 5, data: Buffer.from('backup') }] })
    await expect(pullCloud(4, 'tests')).rejects.toThrow('Cloud changed')
    expect(mocks.restore).not.toHaveBeenCalled()
  })
  it('validates cloud data before invoking the existing safety-backup restore', async () => {
    mocks.query.mockResolvedValue({ rows: [{ revision: 2, data: Buffer.from('backup') }] })
    mocks.validate.mockImplementationOnce(() => { throw new Error('Invalid backup') })
    await expect(pullCloud(2, 'tests')).rejects.toThrow('Invalid backup')
    expect(mocks.restore).not.toHaveBeenCalled()
  })
  it('restores a validated snapshot and records the device revision', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ revision: 2, data: Buffer.from('backup') }] })
    await expect(pullCloud(2, 'tests')).resolves.toEqual({ revision: 2, safetyBackup: 'safe.sacopilot' })
    mocks.query.mockResolvedValue({ rows: [{ revision: 2 }] })
    expect((await cloudStatus('tests')).localRevision).toBe(2)
  })
  it('commits the next revision and retains ten remote snapshots', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('for update') ? [{ revision: 2 }] : [] }))
    await expect(pushCloud('tests')).resolves.toEqual({ revision: 3 })
    expect(mocks.query).toHaveBeenCalledWith('commit')
    expect(mocks.query).toHaveBeenCalledWith('delete from sa_copilot_sync.snapshots where workspace_id = $1 and revision <= $2', ['tests', -7])
  })
})
