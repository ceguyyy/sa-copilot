import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'
import { connectCloud } from './maintenance/cloud.ts'
import { hashPassword } from './password.ts'
import { HttpError } from './http.ts'

export const recoveryDigest = (code: string) => createHash('sha256').update(code).digest('hex')
export async function ensureRecoveryTable(client: pg.Client) {
  await client.query(`create table if not exists sa_copilot_sync.account_recovery (
    account_id uuid primary key references sa_copilot_sync.accounts(id) on delete cascade,
    code_hash text unique not null, created_at timestamptz not null default now())`)
  await client.query('revoke all on sa_copilot_sync.account_recovery from public, anon, authenticated')
}
/** Replaces the previous recovery code. Plaintext is returned once and never persisted. */
export async function issueRecoveryCode(client: pg.Client, accountId: string) {
  await ensureRecoveryTable(client)
  const code = randomBytes(32).toString('base64url')
  await client.query(`insert into sa_copilot_sync.account_recovery(account_id, code_hash) values ($1, $2)
    on conflict (account_id) do update set code_hash = excluded.code_hash, created_at = now()`, [accountId, recoveryDigest(code)])
  return code
}
export async function resetWithRecoveryCode(email: string, code: string, password: string) {
  const client = await connectCloud()
  try {
    await ensureRecoveryTable(client)
    await client.query('begin')
    // Lock the account before the recovery row, matching the code-generation lock order.
    await client.query('select id from sa_copilot_sync.accounts where email = $1 for update', [email])
    // DELETE locks and consumes the code atomically; rollback preserves it on failure.
    const { rows } = await client.query(`delete from sa_copilot_sync.account_recovery r using sa_copilot_sync.accounts a
      where r.account_id = a.id and a.email = $1 and r.code_hash = $2 returning r.account_id`, [email, recoveryDigest(code)])
    if (!rows[0]) throw new HttpError(400, 'The email or recovery code is invalid, or the code has already been used.')
    const hash = await hashPassword(password)
    await client.query('update sa_copilot_sync.accounts set password_hash = $2 where id = $1', [rows[0].account_id, hash])
    await client.query('commit')
    return rows[0].account_id as string
  } catch (e) { await client.query('rollback').catch(() => {}); throw e }
  finally { await client.end() }
}
