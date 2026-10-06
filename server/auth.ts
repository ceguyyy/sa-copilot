import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from './config.ts'
import { HttpError, parseJson } from './http.ts'
import { connectCloud } from './maintenance/cloud.ts'
import { exclusive } from './maintenance/lock.ts'

import { hashPassword, verifyPassword } from './password.ts'
import { ensureRecoveryTable, issueRecoveryCode, resetWithRecoveryCode } from './accountRecovery.ts'
export { hashPassword, verifyPassword } from './password.ts'
export interface Account { id: string; email: string }
const sessions = new Map<string, { account: Account; expires: number; passwordHash: string }>()
const COOKIE = 'sa_copilot_session'
const ownerFile = () => path.join(config.backupDir, 'account-owner.json')
export const accountWorkspace = (account: Account) => `account:${account.id}`
export function currentAccount(c: Context): Account | null {
  const token = getCookie(c, COOKIE)
  const session = token ? sessions.get(token) : undefined
  if (!session || session.expires <= Date.now()) {
    if (token) sessions.delete(token)
    return null
  }
  return session.account
}
export function requireAccount(c: Context): Account {
  const account = currentAccount(c)
  if (!account) throw new HttpError(401, 'Login required')
  return account
}
async function bindOwner(account: Account) {
  let owner: Account | null = null
  try { owner = JSON.parse(await readFile(ownerFile(), 'utf8')) } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  if (owner && owner.id !== account.id) throw new HttpError(409,
    'Data lokal perangkat ini milik akun lain. Gunakan instalasi/profil data terpisah untuk akun ini.')
  if (!owner) {
    await mkdir(config.backupDir, { recursive: true })
    await writeFile(ownerFile(), JSON.stringify(account), { mode: 0o600, flag: 'wx' })
  }
}
const credentials = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(12).max(128) })
// Limit costly password verification attempts on this loopback server.
let attempts: number[] = []
function limitAttempts() {
  attempts = attempts.filter(t => t > Date.now() - 60_000)
  if (attempts.length >= 10) throw new HttpError(429, 'Terlalu banyak percobaan. Tunggu satu menit.')
  attempts.push(Date.now())
}
// Check against the cloud credential so a reset revokes sessions on other computers too.
export async function validateAccount(c: Context): Promise<Account | null> {
  const account = currentAccount(c)
  if (!account) return null
  const token = getCookie(c, COOKIE)!
  const session = sessions.get(token)!
  const client = await connectCloud()
  try {
    const { rows } = await client.query('select password_hash from sa_copilot_sync.accounts where id = $1', [account.id])
    if (rows[0]?.password_hash !== session.passwordHash) {
      sessions.delete(token)
      deleteCookie(c, COOKIE, { path: '/api' })
      return null
    }
    return account
  } finally { await client.end() }
}
export const auth = new Hono()
auth.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  if (c.req.header('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== c.req.header('host'))) {
    throw new HttpError(403, 'Account requests must come from SA Copilot')
  }
  c.header('Cache-Control', 'no-store')
  await next()
})
auth.get('/auth/session', async (c) => c.json({ account: await validateAccount(c), configured: !!config.cloud.databaseUrl }))
for (const action of ['login', 'register'] as const) {
  auth.post(`/auth/${action}`, async (c) => {
    limitAttempts()
    const { email, password } = await parseJson(c, credentials)
    const result = await exclusive(async () => {
      const client = await connectCloud()
      try {
        await client.query(`create schema if not exists sa_copilot_sync`)
        await client.query(`revoke all on schema sa_copilot_sync from public, anon, authenticated`)
        await client.query(`create table if not exists sa_copilot_sync.accounts (
          id uuid primary key default gen_random_uuid(), email text unique not null,
          password_hash text not null, created_at timestamptz not null default now())`)
        await client.query(`revoke all on sa_copilot_sync.accounts from public, anon, authenticated`)
        let account: Account
        let passwordHash: string
        let recoveryCode: string | undefined
        if (action === 'register') {
          // Never create another account on a device already bound to local data.
          try { await readFile(ownerFile()); throw new HttpError(409, 'Perangkat sudah terhubung ke akun. Login dengan akun pemilik data lokal.') }
          catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
          const hash = await hashPassword(password)
          passwordHash = hash
          const result = await client.query('insert into sa_copilot_sync.accounts(email, password_hash) values ($1, $2) returning id, email', [email, hash])
          account = result.rows[0]
        } else {
          const result = await client.query('select id, email, password_hash from sa_copilot_sync.accounts where email = $1', [email])
          const row = result.rows[0]
          // Same hashing cost for an unknown email.
          const valid = await verifyPassword(password, row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`)
          if (!row || !valid) throw new HttpError(401, 'Email atau password salah')
          account = { id: row.id, email: row.email }
          passwordHash = row.password_hash
        }
        await bindOwner(account)
        if (action === 'register') recoveryCode = await issueRecoveryCode(client, account.id)
        return { account, passwordHash, recoveryCode }
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'Email sudah terdaftar. Silakan login.')
        throw e
      } finally { await client.end() }
    })
    const { account, passwordHash, recoveryCode } = result
    const token = randomBytes(32).toString('hex')
    sessions.set(token, { account, passwordHash, expires: Date.now() + 30 * 24 * 60 * 60_000 })
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/api', maxAge: 30 * 24 * 60 * 60 })
    return c.json({ account, ...(recoveryCode ? { recoveryCode } : {}) })
  })
}
auth.post('/auth/logout', (c) => {
  const token = getCookie(c, COOKIE)
  if (token) sessions.delete(token)
  deleteCookie(c, COOKIE, { path: '/api' })
  return c.json({ account: null })
})

auth.post('/auth/recovery-code', async (c) => {
  limitAttempts()
  const account = await validateAccount(c)
  if (!account) throw new HttpError(401, 'Login required')
  const { password } = await parseJson(c, z.object({ password: z.string().min(12).max(128) }))
  const recoveryCode = await exclusive(async () => {
    const client = await connectCloud()
    try {
      await ensureRecoveryTable(client)
      await client.query('begin')
      const { rows } = await client.query('select password_hash from sa_copilot_sync.accounts where id = $1 for update', [account.id])
      if (!rows[0] || !await verifyPassword(password, rows[0].password_hash)) throw new HttpError(401, 'Password salah')
      const code = await issueRecoveryCode(client, account.id)
      await client.query('commit')
      return code
    } catch (e) { await client.query('rollback').catch(() => {}); throw e }
    finally { await client.end() }
  })
  return c.json({ recoveryCode })
})
auth.post('/auth/reset-password', async (c) => {
  limitAttempts()
  const { email, password, recoveryCode } = await parseJson(c, credentials.extend({ recoveryCode: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/) }))
  await exclusive(async () => {
    const id = await resetWithRecoveryCode(email, recoveryCode, password)
    for (const [token, session] of sessions) if (session.account.id === id) sessions.delete(token)
  })
  deleteCookie(c, COOKIE, { path: '/api' })
  return c.json({ message: 'Password berhasil direset. Login dengan password baru. Kode pemulihan sudah terpakai; buat kode baru setelah login.' })
})
