// Settings → Backup: download a .sacopilot file, inspect one, restore one.
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { config } from '../config.ts'
import { HttpError } from '../http.ts'
import { BackupError, MAX_BACKUP_BYTES, unpackBackup } from './format.ts'
import { createBackup, restoreBackup, summarize } from './service.ts'

export const backup = new Hono()

const limit = bodyLimit({ maxSize: MAX_BACKUP_BYTES + 1024 * 1024, onError: (c) => c.json({ error: 'Backup is larger than 2 GB' }, 413) })

async function uploadedBackup(c: Context): Promise<{ bytes: Uint8Array; confirm: string }> {
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a .sacopilot backup file')
  return { bytes: new Uint8Array(await file.arrayBuffer()), confirm: String(form.get('confirm') ?? '') }
}

function asHttp(e: unknown): never {
  if (e instanceof BackupError) throw new HttpError(400, e.message)
  throw e
}

/** Where this server keeps its files (shown in Settings → Backup). */
backup.get('/storage', (c) => c.json({ uploads: config.uploadDir, exports: config.docsDir, backups: config.backupDir }))

backup.get('/backup', async (c) => {
  const { data, manifest } = await createBackup()
  const day = manifest.createdAt.slice(0, 10)
  return c.body(Buffer.from(data), 200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="SA Copilot backup ${day}.sacopilot"`,
  })
})

backup.post('/backup/inspect', limit, async (c) => {
  const { bytes } = await uploadedBackup(c)
  try {
    const { manifest, warnings } = unpackBackup(bytes)
    return c.json({ manifest, summary: summarize(manifest), warnings })
  } catch (e) {
    asHttp(e)
  }
})

backup.post('/backup/restore', limit, async (c) => {
  const { bytes, confirm } = await uploadedBackup(c)
  if (confirm !== 'RESTORE') throw new HttpError(400, 'Type RESTORE to confirm')
  try {
    const result = await restoreBackup(bytes)
    return c.json({ ...result, summary: summarize(result.manifest) })
  } catch (e) {
    asHttp(e)
  }
})
