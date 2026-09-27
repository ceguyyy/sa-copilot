import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

const dir = vi.hoisted(() => {
  // config.ts reads these at import time.
  process.env.DATABASE_URL = 'postgres://test@localhost/test'
  return { path: '' }
})

let storage: typeof import('./storage.ts')

beforeAll(async () => {
  dir.path = await mkdtemp(path.join(os.tmpdir(), 'sa-uploads-'))
  process.env.UPLOAD_DIR = dir.path
  storage = await import('./storage.ts')
})

afterAll(() => rm(dir.path, { recursive: true, force: true }))

describe('safeFileName', () => {
  test('replaces path separators and odd characters', () => {
    const name = storage.safeFileName('../../etc/passwd')
    expect(name).not.toMatch(/[\\/]/)
    expect(name).not.toMatch(/^\./)
    expect(storage.safeFileName('Requirement Klien (final).pdf')).toBe('Requirement_Klien_final_.pdf')
  })

  test('never returns an empty name', () => {
    expect(storage.safeFileName('...')).toBe('file')
  })
})

describe('upload round trip', () => {
  test('saves, reads back and deletes a file inside the upload dir', async () => {
    const key = await storage.saveUpload(new File(['hello'], 'note.txt'))
    expect(key).toMatch(/^[0-9a-f-]{36}-note\.txt$/)
    expect((await storage.readUpload(key)).toString()).toBe('hello')

    await storage.deleteUpload(key)
    expect(await readdir(dir.path)).not.toContain(key)
  })

  test('deleting a missing file is not an error', async () => {
    await expect(storage.deleteUpload('does-not-exist.txt')).resolves.toBeUndefined()
  })

  test('refuses keys that would escape the upload dir', async () => {
    await expect(storage.readUpload('../secret.txt')).rejects.toThrow(/Invalid storage key/)
    await expect(storage.deleteUpload('..\\secret.txt')).rejects.toThrow(/Invalid storage key/)
  })
})
