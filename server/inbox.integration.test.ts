import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
const url=process.env.TEST_DATABASE_URL
if(url && !/_test$/.test(new URL(url).pathname)) throw new Error('TEST_DATABASE_URL must end in _test')
describe.skipIf(!url)('Inbox aggregation (PostgreSQL)',()=>{
  let db:typeof import('./db.ts')
  let svc:typeof import('./inbox.ts')
  const app=new Hono()
  beforeAll(async()=>{
    vi.stubEnv('DATABASE_URL',url!)
    db=await import('./db.ts');svc=await import('./inbox.ts')
    await db.setupDatabase()
    const {BACKUP_TABLES}=await import('./backup/format.ts')
    await db.query(`truncate table ${BACKUP_TABLES.join(',')} cascade`)
    app.route('/',svc.inbox)
  })
  it('combines mismatches, matching results, reviews, open questions, QA and project activity',async()=>{
    const p=(await db.query<{id:string}>("insert into projects(name,client_name) values('Inbox','Client') returning id"))[0]
    await db.query("insert into documents(project_id,type,title) values($1,'tor','TOR')",[p.id])
    await db.query("insert into sources(project_id,kind,name,extracted_text) values($1,'requirement','Brief','Requirement')",[p.id])
    await db.query("insert into open_questions(project_id,question) values($1,'Confirm scope')",[p.id])
    await db.query("insert into consistency_checks(project_id,model,result) values($1,'test',$2)",[p.id,{summary:'Mismatch',issues:[{title:'Dates do not match',detail:'Conflict',suggestion:'Fix dates'}]}])
    const suite=(await db.query<{id:string}>("insert into qa_suites(name) values('Suite') returning id"))[0]
    await db.query('insert into qa_suite_runs(suite_id,report) values($1,$2)',[suite.id,{summary:'Agent did not reply',cases:[{error:'',steps:[{verdict:'no_reply'}]}]}])
    let items=await svc.loadInbox()
    expect(['review','question','consistency','qa','project'].every(category=>items.some(item=>item.category===category))).toBe(true)
    expect(items.find(item=>item.category==='qa')?.status).toBe('attention')
    const mismatch=items.find(item=>item.category==='consistency')!
    expect(mismatch.detail).toBe('Conflict\nFix dates')
    const mark=await app.request('/inbox/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[mismatch],read:true})})
    expect(mark.status).toBe(204)
    expect((await svc.loadInbox()).find(item=>item.id===mismatch.id)?.read).toBe(true)
    await db.query("insert into consistency_checks(project_id,model,result,created_at) values($1,'test',$2,now()+interval '1 second')",[p.id,{summary:'Everything matches',issues:[]}])
    items=await svc.loadInbox()
    expect(items.find(item=>item.category==='consistency')).toMatchObject({title:'Documents match',status:'done',read:false})
    expect(items.some(item=>item.id===mismatch.id)).toBe(false)
    await db.query('update projects set deleted_at=now() where id=$1',[p.id])
    expect((await svc.loadInbox()).some(item=>item.projectName==='Inbox')).toBe(false)
  })
})
