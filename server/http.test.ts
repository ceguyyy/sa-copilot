import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { HttpError, toHttpError } from './http.ts'

describe('toHttpError', () => {
  test('keeps an HttpError as is', () => {
    const e = new HttpError(404, 'Project not found')
    expect(toHttpError(e)).toBe(e)
  })

  test('maps validation errors to 400 with the failing field', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 })
    const err = toHttpError(result.error)
    expect(err.status).toBe(400)
    expect(err.message).toMatch(/^name:/)
  })

  test('maps a Postgres check violation to 400', () => {
    expect(toHttpError(Object.assign(new Error('violates check'), { code: '23514' })).status).toBe(400)
  })

  test('hides internal error details behind a generic 500', () => {
    const err = toHttpError(new Error('connection string postgres://user:secret@host'))
    expect(err.status).toBe(500)
    expect(err.message).not.toContain('secret')
  })
})
