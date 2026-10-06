import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn() }))
vi.mock('./maintenance/cloud.ts', () => ({ connectCloud: async () => mocks }))
import { issueRecoveryCode, recoveryDigest, resetWithRecoveryCode } from './accountRecovery.ts'
import { verifyPassword } from './password.ts'
import type pg from 'pg'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockResolvedValue({ rows: [] })
  mocks.end.mockResolvedValue(undefined)
})
describe('single-use account recovery', () => {
  it('generates independent 256-bit codes and stores only SHA-256 digests', async () => {
    const one = await issueRecoveryCode(mocks as unknown as pg.Client, 'owner-a')
    const two = await issueRecoveryCode(mocks as unknown as pg.Client, 'owner-a')
    expect(one).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(one, 'base64url')).toHaveLength(32)
    expect(two).not.toBe(one)
    const inserts = mocks.query.mock.calls.filter(([sql]) => sql.startsWith('insert into'))
    expect(inserts[0][1]).toEqual(['owner-a', recoveryDigest(one)])
    expect(inserts[0][0]).toContain('on conflict (account_id) do update')
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain(one)
  })
  it('rejects wrong email, wrong code or consumed code without changing a password', async () => {
    await expect(resetWithRecoveryCode('wrong@example.com', 'a'.repeat(43), 'new-password-123')).rejects.toThrow('invalid')
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('update sa_copilot_sync.accounts'))).toBe(false)
    expect(mocks.query).toHaveBeenCalledWith('rollback')
    expect(mocks.query).not.toHaveBeenCalledWith('commit')
    const removal = mocks.query.mock.calls.find(([sql]) => sql.startsWith('delete from'))!
    expect(removal[0]).toContain('a.email = $1 and r.code_hash = $2')
    expect(removal[1]).toEqual(['wrong@example.com', recoveryDigest('a'.repeat(43))])
  })
  it('atomically consumes a valid code and changes only the password of the same account', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('delete from') ? [{ account_id: 'owner-a' }] : [] }))
    expect(await resetWithRecoveryCode('owner@example.com', 'a'.repeat(43), 'new-password-123')).toBe('owner-a')
    const update = mocks.query.mock.calls.find(([sql]) => sql.startsWith('update sa_copilot_sync.accounts'))!
    expect(update[0]).toBe('update sa_copilot_sync.accounts set password_hash = $2 where id = $1')
    expect(update[1][0]).toBe('owner-a')
    expect(await verifyPassword('new-password-123', update[1][1])).toBe(true)
    expect(await verifyPassword('old-password-123', update[1][1])).toBe(false)
    expect(mocks.query).toHaveBeenCalledWith('commit')
    expect(mocks.end).toHaveBeenCalled()
    mocks.query.mockResolvedValue({ rows: [] })
    await expect(resetWithRecoveryCode('owner@example.com', 'a'.repeat(43), 'another-password-123')).rejects.toThrow('invalid')
  })
  it('rolls back code consumption if the password update fails', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('update sa_copilot_sync.accounts')) throw new Error('database failure')
      return { rows: sql.startsWith('delete from') ? [{ account_id: 'owner-a' }] : [] }
    })
    await expect(resetWithRecoveryCode('owner@example.com', 'a'.repeat(43), 'new-password-123')).rejects.toThrow('database failure')
    expect(mocks.query).toHaveBeenCalledWith('rollback')
    expect(mocks.query).not.toHaveBeenCalledWith('commit')
  })
})
