import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { createBackup } from '../backup/service.ts'
import { config } from '../config.ts'
import { HttpError } from '../http.ts'
import { hasActiveAiJobs } from '../ai/activity.ts'
import { acquireExclusive } from './lock.ts'

let heldRelease: (() => void) | null = null
export const desktopUpdate = new Hono()
// This route is called only by Electron main, before the normal account middleware.
desktopUpdate.use('*', async (c, next) => {
  const token = process.env.SA_DESKTOP_UPDATE_TOKEN
  if (!token || c.req.header('X-SA-Desktop-Update') !== token) throw new HttpError(403, 'Desktop update request required')
  await next()
})
desktopUpdate.post('/prepare', async c => {
  const release = await acquireExclusive()
  heldRelease = release
  try {
    if (hasActiveAiJobs()) throw new HttpError(409, 'Wait for active AI and QA tasks to finish before updating')
    const backup = await createBackup()
    await mkdir(config.backupDir, { recursive: true })
    const file = path.join(config.backupDir, `pre-desktop-update-${Date.now()}-${randomUUID()}.sacopilot`)
    await writeFile(file, backup.data)
    if (heldRelease !== release) throw new HttpError(409, 'Update preparation was cancelled')
    // Keep writes locked until Electron stops this server or explicitly cancels.
    return c.json({ safetyBackup: file })
  } catch (error) {
    if (heldRelease === release) { heldRelease = null; release() }
    throw error
  }
})
desktopUpdate.post('/cancel', c => {
  heldRelease?.()
  heldRelease = null
  return c.json({ cancelled: true })
})
