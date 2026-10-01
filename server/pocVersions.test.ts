import { beforeAll, describe, expect, it, vi } from 'vitest'

const url = process.env.TEST_DATABASE_URL
if (url && !/_test$/.test(new URL(url).pathname)) throw new Error('TEST_DATABASE_URL must point to a database whose name ends with _test')

describe.skipIf(!url)('POC version restore (real database)', () => {
  let db: typeof import('./db.ts')
  let versions: typeof import('./pocVersions.ts')
  let pocId: string

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url!)
    db = await import('./db.ts')
    versions = await import('./pocVersions.ts')
    await db.setupDatabase()
    const [project] = await db.query<{ id: string }>(`insert into projects (name, client_name) values ('POC versions', 'Acme') returning id`)
    const [poc] = await db.query<{ id: string }>(`insert into pocs (project_id, name, config) values ($1, 'POC 01', '{"welcomeMessage":"v2"}') returning id`, [project.id])
    pocId = poc.id
    await db.query(`insert into poc_versions (poc_id, config, origin, note) values ($1, '{"welcomeMessage":"v1"}', 'manual', 'first'), ($1, '{"welcomeMessage":"v2"}', 'ai', 'second')`, [pocId])
  })

  it('makes an old version current again and records the restore as a new version', async () => {
    const [v1] = await db.query<{ id: string }>(`select id from poc_versions where poc_id = $1 and version_no = 1`, [pocId])
    const result = await versions.restorePocVersion(pocId, v1.id)

    expect(result.poc.config).toEqual({ welcomeMessage: 'v1' })
    expect(result.version).toMatchObject({ version_no: 3, origin: 'restore', note: 'Restored v1', config: { welcomeMessage: 'v1' } })
    const history = await db.query<{ version_no: number }>(`select version_no from poc_versions where poc_id = $1 order by version_no`, [pocId])
    expect(history.map((h) => h.version_no)).toEqual([1, 2, 3])
  })

  it('refuses a version that belongs to another POC', async () => {
    const [other] = await db.query<{ id: string }>(`insert into pocs (project_id, name) select project_id, 'Other' from pocs where id = $1 returning id`, [pocId])
    const [foreign] = await db.query<{ id: string }>(`insert into poc_versions (poc_id, config) values ($1, '{}') returning id`, [other.id])
    await expect(versions.restorePocVersion(pocId, foreign.id)).rejects.toMatchObject({ status: 404 })
  })
})
