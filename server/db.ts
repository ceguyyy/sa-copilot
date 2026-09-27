// PostgreSQL connection pool + first-run setup (create database, apply schema).
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { config } from './config.ts'

// Return bigint (int8) columns as numbers; sizes never exceed 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, Number)

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })

export async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query<T>(sql, params)
  return res.rows
}

export async function queryOne<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function withTransaction<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await run(client)
    await client.query('commit')
    return result
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}

const DB_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/
const UNDEFINED_DATABASE = '3D000'

/** Creates the target database if it does not exist yet (connects to the `postgres` maintenance DB to do so). */
async function ensureDatabase(): Promise<void> {
  try {
    await pool.query('select 1')
    return
  } catch (e) {
    if ((e as { code?: string }).code !== UNDEFINED_DATABASE) throw e
  }
  const url = new URL(config.databaseUrl)
  const name = decodeURIComponent(url.pathname.slice(1))
  if (!DB_NAME_RE.test(name)) throw new Error(`Refusing to create database with unusual name "${name}"`)
  url.pathname = '/postgres'
  const admin = new pg.Client({ connectionString: url.toString() })
  await admin.connect()
  try {
    await admin.query(`create database "${name}"`)
    console.log(`Created database "${name}"`)
  } finally {
    await admin.end()
  }
}

export async function setupDatabase(): Promise<void> {
  await ensureDatabase()
  await pool.query(await readFile(config.schemaFile, 'utf8'))
}
