import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const url = process.env.TEST_DATABASE_URL
if (url && !/_test$/.test(new URL(url).pathname)) throw new Error('TEST_DATABASE_URL must point to a database whose name ends with _test')

describe.skipIf(!url)('backup round trip (real database)', () => {
  const uploadDir = mkdtempSync(path.join(tmpdir(), 'sa-up-'))
  const backupDir = mkdtempSync(path.join(tmpdir(), 'sa-bk-'))
  let db: typeof import('../db.ts')
  let svc: typeof import('./service.ts')
  let fmt: typeof import('./format.ts')

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url!)
    vi.stubEnv('UPLOAD_DIR', uploadDir)
    vi.stubEnv('BACKUP_DIR', backupDir)
    db = await import('../db.ts')
    svc = await import('./service.ts')
    fmt = await import('./format.ts')
    await db.setupDatabase()
    await db.query(`truncate table ${fmt.BACKUP_TABLES.join(', ')} cascade`)
  })

  it('restores exactly what was backed up, without firing triggers', async () => {
    const [project] = await db.query<{ id: string }>(`insert into projects (name, client_name) values ('Xhealth Appointment', 'Xhealth') returning id`)
    const [doc] = await db.query<{ id: string }>(`insert into documents (project_id, type, title) values ($1, 'tor', 'TOR') returning id`, [project.id])
    await db.query(`insert into document_versions (document_id, content) values ($1, '{"rows":[]}'), ($1, '{"rows":[{"layanan":"AI"}]}')`, [doc.id])
    writeFileSync(path.join(uploadDir, 'k1-brief.pdf'), 'PDF')
    await db.query(`insert into sources (project_id, kind, name, storage_path) values ($1, 'requirement', 'brief.pdf', 'k1-brief.pdf')`, [project.id])
    // The upload folder may be shared with other things (e.g. UPLOAD_DIR=C:/SA Copilot holding exports and templates).
    mkdirSync(path.join(uploadDir, 'Projects'))
    writeFileSync(path.join(uploadDir, 'notes.txt'), 'not an upload')
    const auditBefore = (await db.query<{ n: number }>('select count(*)::int as n from audit_log'))[0].n

    const { data, manifest } = await svc.createBackup()
    expect(manifest.files).toBe(1)

    await db.query('delete from projects')
    const [other] = await db.query<{ id: string }>(`insert into projects (name, client_name) values ('Other', 'Other') returning id`)
    writeFileSync(path.join(uploadDir, 'k2-new.pdf'), 'NEW')
    await db.query(`insert into sources (project_id, kind, name, storage_path) values ($1, 'requirement', 'new.pdf', 'k2-new.pdf')`, [other.id])

    const result = await svc.restoreBackup(data)

    expect((await db.query<{ name: string }>('select name from projects')).map((r) => r.name)).toEqual(['Xhealth Appointment'])
    expect((await db.query<{ version_no: number }>('select version_no from document_versions order by version_no')).map((r) => r.version_no)).toEqual([1, 2])
    expect((await db.query<{ n: number }>('select count(*)::int as n from audit_log'))[0].n).toBe(auditBefore)
    // Uploads the restored database no longer references are removed; anything else in the folder is left alone.
    expect(readdirSync(uploadDir).sort()).toEqual(['Projects', 'k1-brief.pdf', 'notes.txt'])
    expect(readFileSync(path.join(uploadDir, 'k1-brief.pdf'), 'utf8')).toBe('PDF')
    expect(readdirSync(backupDir)).toContain(path.basename(result.safetyBackup))
    expect(svc.summarize(result.manifest)).toEqual({ projects: 1, documents: 1, files: 1 })
  })

  it('restores a backup from an older version whose rows lack newer columns', async () => {
    const legacy = fmt.packBackup(
      {
        tables: {
          // No language / notion_page_id / timestamps: the column defaults must fill them in.
          projects: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Legacy', client_name: 'Old Client', status: 'discovery' }],
          retired_table: [{ id: 1 }],
        },
        files: {},
      },
      '0.9.0',
    ).data
    const result = await svc.restoreBackup(legacy)
    const [row] = await db.query<{ name: string; created_at: Date }>('select name, created_at from projects')
    expect(row.name).toBe('Legacy')
    expect(row.created_at).toBeInstanceOf(Date)
    expect(result.warnings).toEqual(['Skipped unknown table "retired_table" (1 rows)'])
  })

  it('leaves the database untouched when the backup is invalid', async () => {
    const before = await db.query('select id from projects')
    await expect(svc.restoreBackup(new TextEncoder().encode('not a zip'))).rejects.toThrow(fmt.BackupError)
    expect(await db.query('select id from projects')).toEqual(before)
  })
})
