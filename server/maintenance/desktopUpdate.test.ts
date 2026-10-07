import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { createBackup } from '../backup/service.ts'
import { hasActiveAiJobs } from '../ai/activity.ts'
import { HttpError } from '../http.ts'
import { beginWrite, maintenanceBusy } from './lock.ts'
import { desktopUpdate } from './desktopUpdate.ts'

vi.mock('../config.ts', () => ({ config: { backupDir: '/test-backups' } }))
vi.mock('../backup/service.ts', () => ({ createBackup: vi.fn() }))
vi.mock('../ai/activity.ts', () => ({ hasActiveAiJobs: vi.fn(() => false) }))
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }))

const app = new Hono()
app.route('/update', desktopUpdate)
app.onError((error, c) => c.json({ error: error.message }, (error instanceof HttpError ? error.status : 500) as 400))
const call = (action: string, token = 'internal-test-token') => app.request(`/update/${action}`, { method: 'POST', headers: { 'X-SA-Desktop-Update': token } })
beforeEach(() => {
  vi.stubEnv('SA_DESKTOP_UPDATE_TOKEN', 'internal-test-token')
  vi.mocked(createBackup).mockResolvedValue({ data: new Uint8Array([1, 2]), manifest: {} as Awaited<ReturnType<typeof createBackup>>['manifest'] })
})
afterEach(async () => { await call('cancel'); vi.resetAllMocks(); vi.unstubAllEnvs() })

describe('desktop update safety backup', () => {
  it('rejects browser requests without the main-process token', async () => {
    expect((await call('prepare', 'wrong-token')).status).toBe(403)
    expect(createBackup).not.toHaveBeenCalled()
    expect(maintenanceBusy()).toBe(false)
  })
  it('writes a backup and retains the write lock until shutdown or cancellation', async () => {
    const result = await call('prepare')
    expect(result.status).toBe(200)
    expect((await result.json()).safetyBackup).toMatch(/pre-desktop-update-.*\.sacopilot$/)
    expect(mkdir).toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledWith(expect.any(String), new Uint8Array([1, 2]))
    expect(() => beginWrite()).toThrow('temporarily locked')
    expect((await call('prepare')).status).toBe(409)
    await call('cancel')
    expect(maintenanceBusy()).toBe(false)
  })
  it('refuses to stop a running AI or QA job', async () => {
    vi.mocked(hasActiveAiJobs).mockReturnValue(true)
    expect((await call('prepare')).status).toBe(409)
    expect(createBackup).not.toHaveBeenCalled()
    expect(maintenanceBusy()).toBe(false)
  })
  it('unlocks data if saving the safety backup fails', async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('Disk full'))
    expect((await call('prepare')).status).toBe(500)
    expect(maintenanceBusy()).toBe(false)
  })
})
