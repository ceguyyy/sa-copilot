import { Hono, type MiddlewareHandler } from 'hono'
import { query, queryOne, withTransaction } from './db.ts'
import { HttpError, idParam, notFound, UUID_RE } from './http.ts'
import { deleteUpload } from './storage.ts'
import { removeFiles } from './exports.ts'
import { exclusive } from './maintenance/lock.ts'

export const RETENTION_DAYS = 30
export const trash = new Hono()

// Direct URLs and AI requests must not continue working on trashed resources.
export const guardTrash: MiddlewareHandler = async (c, next) => {
  const path = c.req.path
  if (path.startsWith('/api/trash')) return next()
  const refs: {kind:string;id:string}[] = []
  const match = path.match(/^\/api\/(projects|sources|documents|pocs)\/([a-f0-9-]{36})(?:\/|$)/i)
  if (match) refs.push({kind:match[1],id:match[2]})
  const projectId = c.req.query('projectId')
  if (projectId && UUID_RE.test(projectId)) refs.push({kind:'projects',id:projectId})
  if ((path.startsWith('/api/ai') || path === '/api/documents' || path.startsWith('/api/sources/')) && c.req.method === 'POST' && c.req.header('content-type')?.includes('application/json')) {
    const body = await c.req.raw.clone().json().catch(() => null)
    for (const [key,kind] of [['projectId','projects'],['documentId','documents'],['pocId','pocs']]) {
      if (typeof body?.[key] === 'string' && UUID_RE.test(body[key])) refs.push({kind,id:body[key]})
    }
  }
  for (const ref of refs) {
    const sql = ref.kind === 'projects'
      ? 'select 1 from projects where id=$1 and deleted_at is not null'
      : ref.kind === 'sources'
        ? 'select 1 from sources s left join projects p on p.id=s.project_id where s.id=$1 and (s.deleted_at is not null or p.deleted_at is not null)'
        : `select 1 from ${ref.kind} r join projects p on p.id=r.project_id where r.id=$1 and p.deleted_at is not null`
    if (await queryOne(sql,[ref.id])) throw new HttpError(410,'This item is in Trash. Restore it before opening or editing it.')
  }
  await next()
}
const tableFor = (kind: string) => {
  if (kind === 'project') return 'projects'
  if (kind === 'source') return 'sources'
  throw new HttpError(400, 'Invalid trash item type')
}

trash.get('/trash', async c => c.json({ retentionDays: RETENTION_DAYS, items: await query(`
  select 'project' as kind,id,name,null::text as project_name,null::uuid as project_id,
    deleted_at,deleted_at + interval '30 days' as expires_at,deleted_at <= now() - interval '30 days' as expired from projects where deleted_at is not null
  union all
  select 'source',s.id,s.name,p.name,s.project_id,s.deleted_at,s.deleted_at + interval '30 days',s.deleted_at <= now() - interval '30 days'
    from sources s left join projects p on p.id=s.project_id
    where s.deleted_at is not null and (p.id is null or p.deleted_at is null)
  order by deleted_at desc`) }))

trash.post('/trash/:kind/:id/restore', async c => {
  const table = tableFor(c.req.param('kind'))
  const row = await withTransaction(async tx => {
    if (table === 'sources') {
      const source = (await tx.query('select project_id from sources where id=$1', [idParam(c)])).rows[0]
      if (source?.project_id) {
        const parent = (await tx.query('select deleted_at from projects where id=$1 for update', [source.project_id])).rows[0]
        if (!parent || parent.deleted_at) throw new HttpError(409, 'Restore the project first')
      }
    }
    return (await tx.query(`update ${table} set deleted_at=null where id=$1
      and deleted_at > now() - interval '30 days' returning *`, [idParam(c)])).rows[0]
  })
  return c.json(notFound(row ?? null, 'Recoverable item'))
})

// Queue file removals in the same transaction as row deletion. A failed unlink is retried.
export async function purgeItem(kind: string, id: string, expiredOnly = false) {
  const table = tableFor(kind)
  await withTransaction(async tx => {
    const row = (await tx.query(`select * from ${table} where id=$1 and deleted_at is not null
      ${expiredOnly ? "and deleted_at <= now() - interval '30 days'" : ''} for update`, [id])).rows[0]
    if (!row) return
    if (table === 'projects') {
      await tx.query(`insert into trash_file_cleanup(kind,path)
        select 'upload',storage_path from sources where project_id=$1 and storage_path is not null
        on conflict do nothing`, [id])
      await tx.query(`insert into trash_file_cleanup(kind,path)
        select 'export',unnest(export_files) from documents where project_id=$1 on conflict do nothing`, [id])
    } else if (row.storage_path) {
      await tx.query("insert into trash_file_cleanup(kind,path) values('upload',$1) on conflict do nothing", [row.storage_path])
    }
    await tx.query(`delete from ${table} where id=$1`, [id])
  })
}

export async function drainCleanup() {
  for (const file of await query<{kind: string; path: string}>('select * from trash_file_cleanup')) {
    try {
      // Shared upload keys or export paths must stay while any surviving row references them.
      const referenced = file.kind === 'upload'
        ? await queryOne('select 1 from sources where storage_path=$1 union all select 1 from attachments where storage_path=$1 limit 1', [file.path])
        : await queryOne('select 1 from documents where $1=any(export_files) limit 1', [file.path])
      if (!referenced) {
        if (file.kind === 'upload') await deleteUpload(file.path)
        else await removeFiles([file.path])
      }
      await query('delete from trash_file_cleanup where kind=$1 and path=$2', [file.kind,file.path])
    } catch (e) { console.error('Trash file cleanup will retry:', e) }
  }
}

trash.delete('/trash/:kind/:id', async c => {
  await purgeItem(c.req.param('kind'), idParam(c))
  await drainCleanup()
  return c.body(null,204)
})

export async function cleanupTrash() {
  await exclusive(async () => {
    for (const kind of ['project','source']) {
      const rows = await query<{id:string}>(`select id from ${tableFor(kind)} where deleted_at <= now() - interval '30 days'`)
      for (const row of rows) await purgeItem(kind,row.id,true)
    }
    await drainCleanup()
  })
}

trash.post('/projects/:id/archive', async c => c.json(notFound(await queryOne(
  'update projects set archived_at=now() where id=$1 and deleted_at is null returning *', [idParam(c)]), 'Project')))
trash.post('/projects/:id/unarchive', async c => c.json(notFound(await queryOne(
  'update projects set archived_at=null where id=$1 and deleted_at is null returning *', [idParam(c)]), 'Project')))
