import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const url=process.env.TEST_DATABASE_URL
if (url && !/_test$/.test(new URL(url).pathname)) throw new Error('TEST_DATABASE_URL must point to a database whose name ends with _test')

describe.skipIf(!url)('archive and trash (real PostgreSQL)',()=>{
  const uploads=mkdtempSync(path.join(tmpdir(),'sa-trash-uploads-'))
  const exports=mkdtempSync(path.join(tmpdir(),'sa-trash-exports-'))
  const backups=mkdtempSync(path.join(tmpdir(),'sa-trash-backups-'))
  let db:typeof import('./db.ts')
  let service:typeof import('./trash.ts')
  let backup:typeof import('./backup/service.ts')
  const app=new Hono()
  beforeAll(async()=>{
    vi.stubEnv('DATABASE_URL',url!)
    vi.stubEnv('UPLOAD_DIR',uploads)
    vi.stubEnv('DOCS_DIR',exports)
    vi.stubEnv('BACKUP_DIR',backups)
    db=await import('./db.ts')
    service=await import('./trash.ts')
    backup=await import('./backup/service.ts')
    await db.setupDatabase()
    const {BACKUP_TABLES}=await import('./backup/format.ts')
    await db.query(`truncate table ${BACKUP_TABLES.join(',')},trash_file_cleanup cascade`)
    const {toHttpError}=await import('./http.ts')
    app.onError((e,c)=>{const err=toHttpError(e);return c.json({error:err.message},err.status as 400)})
    app.use('/api/*',service.guardTrash)
    app.route('/api',(await import('./routes.ts')).api)
  })
  const call=(route:string,method='GET')=>app.request(`/api${route}`,{method})

  it('archives indefinitely, restores project contents, preserves separately trashed sources and backs up files',async()=>{
    const p=(await db.query<{id:string}>("insert into projects(name,client_name) values('Recovery','Client') returning id"))[0]
    const doc=(await db.query<{id:string}>("insert into documents(project_id,type,title) values($1,'tor','TOR') returning id",[p.id]))[0]
    await db.query("insert into document_versions(document_id,content) values($1,'{}')",[doc.id])
    writeFileSync(path.join(uploads,'brief.pdf'),'brief content')
    const source=(await db.query<{id:string}>("insert into sources(project_id,kind,name,storage_path) values($1,'requirement','Brief','brief.pdf') returning id",[p.id]))[0]
    expect((await call(`/projects/${p.id}/archive`,'POST')).status).toBe(200)
    expect(await (await call('/projects')).json()).toEqual([])
    expect((await (await call('/projects?archived=true')).json()).length).toBe(1)
    expect((await call(`/sources/${source.id}`,'DELETE')).status).toBe(204)
    expect(existsSync(path.join(uploads,'brief.pdf'))).toBe(true)
    expect(await (await call(`/sources?projectId=${p.id}`)).json()).toEqual([])
    expect((await call(`/projects/${p.id}`,'DELETE')).status).toBe(204)
    expect((await call(`/documents/${doc.id}`)).status).toBe(410)
    const listing=await (await call('/trash')).json()
    expect(listing.items.map((item:{kind:string})=>item.kind)).toEqual(['project'])
    expect((await call(`/trash/source/${source.id}/restore`,'POST')).status).toBe(409)
    const snapshot=await backup.createBackup()
    expect(snapshot.manifest.files).toBe(1)
    expect((await call(`/trash/project/${p.id}/restore`,'POST')).status).toBe(200)
    expect((await db.query('select * from document_versions where document_id=$1',[doc.id])).length).toBe(1)
    expect((await db.query('select deleted_at from sources where id=$1',[source.id]))[0].deleted_at).not.toBeNull()
    expect((await call(`/trash/source/${source.id}/restore`,'POST')).status).toBe(200)
    expect((await call(`/projects/${p.id}/unarchive`,'POST')).status).toBe(200)
    expect((await (await call('/projects')).json()).length).toBe(1)
  })

  it('expires at 30 days and cleans uploads and tracked exports without deleting custom files',async()=>{
    const p=(await db.query<{id:string}>("insert into projects(name,client_name,deleted_at) values('Expired','Client',now()-interval '31 days') returning id"))[0]
    const tracked=path.join(exports,'tracked.md')
    const custom=path.join(exports,'custom.txt')
    writeFileSync(tracked,'generated');writeFileSync(custom,'keep');writeFileSync(path.join(uploads,'expired.pdf'),'expired')
    await db.query("insert into documents(project_id,type,title,export_files) values($1,'tor','Old',array[$2])",[p.id,tracked])
    await db.query("insert into sources(project_id,kind,name,storage_path) values($1,'requirement','Old','expired.pdf')",[p.id])
    expect((await call(`/trash/project/${p.id}/restore`,'POST')).status).toBe(404)
    await service.cleanupTrash()
    expect(await db.query('select 1 from projects where id=$1',[p.id])).toEqual([])
    expect(existsSync(path.join(uploads,'expired.pdf'))).toBe(false)
    expect(existsSync(tracked)).toBe(false)
    expect(existsSync(custom)).toBe(true)
    expect(await db.query('select * from trash_file_cleanup')).toEqual([])
  })
})
