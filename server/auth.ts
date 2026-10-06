import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from './config.ts'
import { HttpError, parseJson } from './http.ts'
import { connectCloud } from './maintenance/cloud.ts'
import { exclusive } from './maintenance/lock.ts'

const scrypt = promisify(scryptCallback)
export interface Account { id: string; email: string }
const sessions = new Map<string, { account: Account; expires: number }>()
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
export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64) as Buffer
  return `${salt}:${hash.toString('hex')}`
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(':')
  if (!salt || !hex || !/^[a-f0-9]{128}$/.test(hex)) return false
  const hash = await scrypt(password, salt, 64) as Buffer
  return timingSafeEqual(hash, Buffer.from(hex, 'hex'))
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
export const auth = new Hono()
auth.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  if (c.req.header('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== c.req.header('host'))) {
    throw new HttpError(403, 'Account requests must come from SA Copilot')
  }
  c.header('Cache-Control', 'no-store')
  await next()
})
auth.get('/auth/session', (c) => c.json({ account: currentAccount(c), configured: !!config.cloud.databaseUrl }))
for (const action of ['login', 'register'] as const) {
  auth.post(`/auth/${action}`, async (c) => {
    attempts = attempts.filter(t => t > Date.now() - 60_000)
    if (attempts.length >= 10) throw new HttpError(429, 'Terlalu banyak percobaan. Tunggu satu menit.')
    attempts.push(Date.now())
    const { email, password } = await parseJson(c, credentials)
    const account = await exclusive(async () => {
      const client = await connectCloud()
      try {
        await client.query(`create schema if not exists sa_copilot_sync`)
        await client.query(`revoke all on schema sa_copilot_sync from public, anon, authenticated`)
        await client.query(`create table if not exists sa_copilot_sync.accounts (
          id uuid primary key default gen_random_uuid(), email text unique not null,
          password_hash text not null, created_at timestamptz not null default now())`)
        await client.query(`revoke all on sa_copilot_sync.accounts from public, anon, authenticated`)
        let account: Account
        if (action === 'register') {
          // Never create another account on a device already bound to local data.
          try { await readFile(ownerFile()); throw new HttpError(409, 'Perangkat sudah terhubung ke akun. Login dengan akun pemilik data lokal.') }
          catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
          const hash = await hashPassword(password)
          const result = await client.query('insert into sa_copilot_sync.accounts(email, password_hash) values ($1, $2) returning id, email', [email, hash])
          account = result.rows[0]
        } else {
          const result = await client.query('select id, email, password_hash from sa_copilot_sync.accounts where email = $1', [email])
          const row = result.rows[0]
          // Same hashing cost for an unknown email.
          const valid = await verifyPassword(password, row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`)
          if (!row || !valid) throw new HttpError(401, 'Email atau password salah')
          account = { id: row.id, email: row.email }
        }
        await bindOwner(account)
        return account
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'Email sudah terdaftar. Silakan login.')
        throw e
      } finally { await client.end() }
    })
    const token = randomBytes(32).toString('hex')
    sessions.set(token, { account, expires: Date.now() + 30 * 24 * 60 * 60_000 })
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/api', maxAge: 30 * 24 * 60 * 60 })
    return c.json({ account })
  })
}
auth.post('/auth/logout', (c) => {
  const token = getCookie(c, COOKIE)
  if (token) sessions.delete(token)
  deleteCookie(c, COOKIE, { path: '/api' })
  return c.json({ account: null })
})
