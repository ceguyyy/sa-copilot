import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn() }))
vi.mock('./config.ts', () => ({ config: { backupDir: mkdtempSync(path.join(tmpdir(), 'sa-auth-')), cloud: { databaseUrl: 'fake' } } }))
vi.mock('./maintenance/cloud.ts', () => ({ connectCloud: async () => mocks }))
import { auth, requireAccount, accountWorkspace, hashPassword, verifyPassword } from './auth.ts'
import { config } from './config.ts'
import { toHttpError } from './http.ts'
const app = new Hono()
app.onError((e, c) => { const err = toHttpError(e); return c.json({ error: err.message }, err.status as 400) })
app.route('/api', auth)
app.get('/api/private', c => c.json({ workspace: accountWorkspace(requireAccount(c)) }))
const post = (action: string, email: string, password = 'correct-password-123') => app.request(`/api/auth/${action}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.end.mockResolvedValue(undefined)
  mocks.query.mockResolvedValue({ rows: [] })
})
describe('account authentication and ownership', () => {
  it('salts passwords and rejects a different password', async () => {
    const one = await hashPassword('correct-password-123')
    const two = await hashPassword('correct-password-123')
    expect(one).not.toBe(two)
    expect(one).not.toContain('correct-password')
    expect(await verifyPassword('correct-password-123', one)).toBe(true)
    expect(await verifyPassword('wrong-password-123', one)).toBe(false)
  })
  it('blocks unauthenticated access and cross-site login', async () => {
    expect((await app.request('/api/private')).status).toBe(401)
    const res = await app.request('/api/auth/login', { method: 'POST', headers: { origin: 'https://other.example', host: 'localhost' } })
    expect(res.status).toBe(403)
  })
  it('does not open a session for invalid credentials', async () => {
    const res = await post('login', 'missing@example.com')
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
  it('registers normalized email, scopes sessions, blocks a different owner and revokes logout', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('insert into') ? [{ id: 'user-a', email: 'owner@example.com' }] : [] }))
    const registered = await post('register', 'OWNER@example.com')
    expect(registered.status).toBe(200)
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]
    expect(registered.headers.get('set-cookie')).toContain('HttpOnly')
    expect(registered.headers.get('set-cookie')).toContain('SameSite=Strict')
    const insert = mocks.query.mock.calls.find(([sql]) => sql.startsWith('insert into'))!
    expect(insert[1][0]).toBe('owner@example.com')
    expect(await verifyPassword('correct-password-123', insert[1][1])).toBe(true)
    expect(JSON.parse(readFileSync(path.join(config.backupDir, 'account-owner.json'), 'utf8')).id).toBe('user-a')
    const data = await app.request('/api/private', { headers: { cookie } })
    expect(await data.json()).toEqual({ workspace: 'account:user-a' })
    const hash = await hashPassword('correct-password-123')
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('select') ? [{ id: 'user-b', email: 'other@example.com', password_hash: hash }] : [] }))
    const other = await post('login', 'other@example.com')
    expect(other.status).toBe(409)
    expect(other.headers.get('set-cookie')).toBeNull()
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('select') ? [{ id: 'user-a', email: 'owner@example.com', password_hash: hash }] : [] }))
    const loggedIn = await post('login', 'owner@example.com')
    expect(loggedIn.status).toBe(200)
    expect(await loggedIn.json()).toEqual({ account: { id: 'user-a', email: 'owner@example.com' } })
    const logout = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } })
    expect(logout.status).toBe(200)
    expect((await app.request('/api/private', { headers: { cookie } })).status).toBe(401)
  })
})
