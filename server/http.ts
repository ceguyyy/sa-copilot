// Shared HTTP helpers: typed errors, id validation, and mapping DB/validation errors to status codes.
import type { Context } from 'hono'
import { ZodError, type ZodType } from 'zod'

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function idParam(c: Context, name = 'id'): string {
  const id = c.req.param(name)
  if (!id || !UUID_RE.test(id)) throw new HttpError(400, `Invalid ${name}`)
  return id
}

export async function parseJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'Invalid JSON body')
  })
  return schema.parse(body)
}

export function notFound<T>(row: T | null, what: string): T {
  if (row === null) throw new HttpError(404, `${what} not found`)
  return row
}

// Postgres error codes that mean "the client sent bad data", not "the server broke".
const CLIENT_PG_CODES: Record<string, string> = {
  '22P02': 'Invalid value',
  '23502': 'Missing required field',
  '23503': 'Referenced record does not exist',
  '23505': 'Duplicate record',
  '23514': 'Value not allowed',
}

export function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e
  if (e instanceof ZodError) {
    const issue = e.issues[0]
    return new HttpError(400, `${issue.path.join('.') || 'body'}: ${issue.message}`)
  }
  const code = (e as { code?: string }).code
  if (code && CLIENT_PG_CODES[code]) return new HttpError(400, CLIENT_PG_CODES[code])
  return new HttpError(500, 'Internal server error')
}
