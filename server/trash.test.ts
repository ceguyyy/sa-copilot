import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const mocks = vi.hoisted(() => ({query:vi.fn(),one:vi.fn(),tx:vi.fn(),upload:vi.fn(),exports:vi.fn()}))
vi.mock('./db.ts', () => ({query:mocks.query,queryOne:mocks.one,withTransaction:async (run: (tx:unknown)=>unknown)=>run({query:mocks.tx})}))
vi.mock('./storage.ts', () => ({deleteUpload:mocks.upload}))
vi.mock('./exports.ts', () => ({removeFiles:mocks.exports}))
import { cleanupTrash, drainCleanup, guardTrash, purgeItem, trash } from './trash.ts'
import { HttpError } from './http.ts'

const id = '00000000-0000-4000-8000-000000000001'
const app = new Hono()
app.onError((e,c) => c.json({error:e.message},e instanceof HttpError ? e.status as 400 : 500))
app.route('/',trash)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockResolvedValue([])
  mocks.one.mockResolvedValue(null)
  mocks.tx.mockResolvedValue({rows:[]})
  mocks.upload.mockResolvedValue(undefined)
  mocks.exports.mockResolvedValue(undefined)
})

describe('trash recovery and cleanup', () => {
  it('requires restoring a deleted parent before a source', async () => {
    mocks.tx.mockResolvedValueOnce({rows:[{project_id:id}]}).mockResolvedValueOnce({rows:[{deleted_at:new Date()}]})
    const response = await app.request(`/trash/source/${id}/restore`,{method:'POST'})
    expect(response.status).toBe(409)
    expect(mocks.tx.mock.calls.some(([sql])=>sql.startsWith('update'))).toBe(false)
  })
  it('refuses expired or missing recovery rows without touching files',async () => {
    const response = await app.request(`/trash/project/${id}/restore`,{method:'POST'})
    expect(response.status).toBe(404)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.exports).not.toHaveBeenCalled()
  })
  it('queues project uploads and exports before deleting the parent', async () => {
    mocks.tx.mockResolvedValueOnce({rows:[{id,deleted_at:new Date()}]})
    await purgeItem('project',id)
    expect(mocks.tx.mock.calls.map(([sql])=>sql.trim().split(/\s+/)[0])).toEqual(['select','insert','insert','delete'])
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('never purges an active item',async () => {
    await purgeItem('project',id)
    expect(mocks.tx).toHaveBeenCalledTimes(1)
  })
  it('rejects arbitrary table names',async () => {
    expect((await app.request(`/trash/accounts/${id}`,{method:'DELETE'})).status).toBe(400)
    expect(mocks.tx).not.toHaveBeenCalled()
  })
  it('keeps failed unlinks queued, then retries successfully',async () => {
    mocks.query.mockResolvedValue([{kind:'upload',path:'saved.pdf'}])
    mocks.upload.mockRejectedValueOnce(new Error('file locked'))
    const log=vi.spyOn(console,'error').mockImplementation(()=>{})
    await drainCleanup()
    expect(mocks.query).toHaveBeenCalledTimes(1)
    await drainCleanup()
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.query).toHaveBeenLastCalledWith('delete from trash_file_cleanup where kind=$1 and path=$2',['upload','saved.pdf'])
    log.mockRestore()
  })
  it('preserves a shared file referenced by surviving data',async () => {
    mocks.query.mockResolvedValueOnce([{kind:'upload',path:'shared.pdf'}])
    mocks.one.mockResolvedValue({exists:1})
    await drainCleanup()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.query).toHaveBeenLastCalledWith('delete from trash_file_cleanup where kind=$1 and path=$2',['upload','shared.pdf'])
  })
  it('only schedules expired rows for automatic purge',async () => {
    await cleanupTrash()
    expect(mocks.query.mock.calls.slice(0,2).every(([sql])=>sql.includes("deleted_at <= now() - interval '30 days'"))).toBe(true)
  })
  it('blocks direct resource links and source listing for deleted parents',async () => {
    const guarded=new Hono()
    guarded.onError((e,c)=>c.json({error:e.message},e instanceof HttpError ? e.status as 400 : 500))
    guarded.use('/api/*',guardTrash)
    guarded.get('/api/*',c=>c.json({ok:true}))
    mocks.one.mockResolvedValue({exists:1})
    expect((await guarded.request(`/api/documents/${id}`)).status).toBe(410)
    expect((await guarded.request(`/api/sources?projectId=${id}`)).status).toBe(410)
  })
})
