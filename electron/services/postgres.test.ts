import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { freePort } from '../ports.ts'
import { platformPackage, startPostgres } from './postgres.ts'

describe('platformPackage', () => {
  it('maps the supported targets to their embedded-postgres binary package', () => {
    expect(platformPackage('win32', 'x64')).toBe('@embedded-postgres/windows-x64')
    expect(platformPackage('darwin', 'arm64')).toBe('@embedded-postgres/darwin-arm64')
    expect(platformPackage('darwin', 'x64')).toBe('@embedded-postgres/darwin-x64')
  })
  it('refuses targets the installers do not ship', () => {
    expect(() => platformPackage('linux', 'x64')).toThrow(/not supported/)
  })
})

// Real Postgres (~20 s): run with PG_INTEGRATION=1.
describe.skipIf(process.env.PG_INTEGRATION !== '1')('embedded Postgres lifecycle', () => {
  const query = async (port: number, sql: string) => {
    const client = new pg.Client({ connectionString: `postgres://postgres:pw@127.0.0.1:${port}/postgres` })
    await client.connect()
    try {
      return (await client.query(sql)).rows
    } finally {
      await client.end()
    }
  }

  it('stops cleanly so the same cluster starts again (reopening the app)', async () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'sa-pg-')), 'pg')
    const first = await freePort()
    const a = await startPostgres({ dir, port: first, password: 'pw', log: () => {} })
    await query(first, 'create table kept (x int); insert into kept values (42)')
    await a.stop()
    // A clean shutdown removes the lock file; a forced kill (taskkill /f) leaves it and orphans the backends.
    expect(existsSync(path.join(dir, 'postmaster.pid'))).toBe(false)

    const second = await freePort()
    const b = await startPostgres({ dir, port: second, password: 'pw', log: () => {} })
    expect(await query(second, 'select x from kept')).toEqual([{ x: 42 }])
    // db/schema.sql has UTF-8 text (e.g. "→"); a cluster in the OS code page (WIN1252) cannot load it.
    expect(await query(second, "select current_setting('server_encoding') as enc")).toEqual([{ enc: 'UTF8' }])
    expect(await query(second, "select '→ ✓ Rp' as t")).toEqual([{ t: '→ ✓ Rp' }])
    await b.stop()
  }, 120_000)

  it('recovers when the previous session crashed and left Postgres running', async () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'sa-pg-')), 'pg')
    await startPostgres({ dir, port: await freePort(), password: 'pw', log: () => {} }) // never stopped: the app "crashed"
    const port = await freePort()
    const again = await startPostgres({ dir, port, password: 'pw', log: () => {} })
    expect(await query(port, 'select 1 as ok')).toEqual([{ ok: 1 }])
    await again.stop()
  }, 120_000)
})
