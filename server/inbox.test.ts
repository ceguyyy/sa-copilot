import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
const mocks=vi.hoisted(()=>({query:vi.fn(),tx:vi.fn(),jobs:vi.fn()}))
vi.mock('./db.ts',()=>({query:mocks.query,withTransaction:async(run:(tx:unknown)=>unknown)=>run({query:mocks.tx})}))
vi.mock('./ai/activity.ts',()=>({activitySnapshot:mocks.jobs}))
import { inbox, loadInbox } from './inbox.ts'
import { toHttpError } from './http.ts'
const app=new Hono()
app.onError((e,c)=>{const error=toHttpError(e);return c.json({error:error.message},error.status as 400)})
app.route('/',inbox)
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue([]);mocks.jobs.mockResolvedValue([]);mocks.tx.mockResolvedValue({rows:[]})})
describe('Inbox',()=>{
  it('re-notifies when an already read working job completes or fails',async()=>{
    const job={id:'job',task:'generate tor',startedAt:100,status:'working',detail:'Preparing'}
    mocks.jobs.mockResolvedValue([job])
    mocks.query.mockImplementation(async(sql:string)=>sql.includes('inbox_reads')?[{id:'ai:job',token:'working:100'}]:[])
    expect((await loadInbox())[0].read).toBe(true)
    mocks.jobs.mockResolvedValue([{...job,status:'done',finishedAt:200}])
    expect((await loadInbox())[0]).toMatchObject({read:false,token:'done:200'})
    mocks.jobs.mockResolvedValue([{...job,status:'error',finishedAt:300}])
    expect((await loadInbox())[0]).toMatchObject({read:false,token:'error:300'})
  })
  it('omits jobs for deleted projects but keeps global work',async()=>{
    mocks.jobs.mockResolvedValue([{id:'gone',projectId:'deleted',task:'chat',status:'done',startedAt:10},{id:'global',task:'assist',status:'error',startedAt:20}])
    expect((await loadInbox()).map(item=>item.id)).toEqual(['ai:global'])
  })
  it('returns mixed attention and AI results in chronological order with result links',async()=>{
    mocks.query.mockImplementation(async(sql:string)=>sql.startsWith('select id,name')?[{id:'p',name:'Client'}]:sql.includes('with active')?[{id:'review:r',title:'Review',detail:'Changed',category:'review',status:'attention',at:new Date(200),project_name:'Client',href:'/projects/p'}]:[])
    mocks.jobs.mockResolvedValue([{id:'j',projectId:'p',documentId:'d',task:'generate tor',status:'done',startedAt:10,finishedAt:100,detail:'Done'}])
    const items=await loadInbox()
    expect(items.map(item=>item.id)).toEqual(['review:r','ai:j'])
    expect(items[1].href).toBe('/projects/p/docs/d')
  })
  it('stores acknowledgements separately without resolving underlying findings',async()=>{
    const result=await app.request('/inbox/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id:'ai:j',token:'done:100'}],read:true})})
    expect(result.status).toBe(204)
    expect(mocks.tx).toHaveBeenCalledWith(expect.stringContaining('insert into inbox_reads'),['ai:j','done:100'])
    expect(mocks.tx).toHaveBeenCalledTimes(1)
  })
  it('only marks a matching acknowledgement unread and validates input',async()=>{
    const result=await app.request('/inbox/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id:'ai:j',token:'working:100'}],read:false})})
    expect(result.status).toBe(204)
    expect(mocks.tx).toHaveBeenCalledWith('delete from inbox_reads where id=$1 and token=$2',['ai:j','working:100'])
    expect((await app.request('/inbox/read',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(400)
  })
})
