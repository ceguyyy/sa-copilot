import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('GET /storage', () => {
  it('reports where uploads, exports and backups are kept', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
    vi.stubEnv('UPLOAD_DIR', path.resolve('/sa/uploads'))
    vi.stubEnv('DOCS_DIR', path.resolve('/sa/exports'))
    vi.stubEnv('BACKUP_DIR', path.resolve('/sa/backups'))
    const { backup } = await import('./routes.ts')
    const res = await backup.request('/storage')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ uploads: path.resolve('/sa/uploads'), exports: path.resolve('/sa/exports'), backups: path.resolve('/sa/backups') })
    vi.unstubAllEnvs()
  })
})
