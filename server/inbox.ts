import { Hono } from 'hono'
import { z } from 'zod'
import { query, withTransaction } from './db.ts'
import { parseJson } from './http.ts'
import { activitySnapshot } from './ai/activity.ts'
import { notificationToken, type InboxItem } from '../shared/inbox.ts'

export const inbox=new Hono()
export async function loadInbox(workspace?:string):Promise<InboxItem[]> {
  const [jobs,projects,rows,reads]=await Promise.all([
    activitySnapshot(),
    query<{id:string;name:string}>('select id,name from projects where deleted_at is null'),
    query<{id:string;title:string;detail:string;status:InboxItem['status'];category:string;at:Date;project_id:string;project_name:string;href:string}>(`
      with active as (select id,name from projects where deleted_at is null and archived_at is null),
      checks as (select distinct on (project_id) * from consistency_checks order by project_id,created_at desc),
      updates as (select a.*,p.name as project_name from audit_log a join active p on p.id=a.project_id order by a.at desc limit 200)
      select 'review:'||r.id||':'||r.change_no as id,'Review required' as title,r.reason as detail,
        'attention' as status,'review' as category,r.changed_at as at,r.project_id,p.name as project_name,
        case when r.target_kind='document' then '/projects/'||r.project_id||'/docs/'||r.target_id else '/projects/'||r.project_id||'?tab=demo' end as href
        from review_alerts r join active p on p.id=r.project_id where r.reviewed_at is null
      union all select 'question:'||q.id,q.question,q.context,'attention','question',q.updated_at,q.project_id,p.name,
        '/projects/'||q.project_id||'?tab=requirements#project-questions' from open_questions q join active p on p.id=q.project_id where q.status='open'
      union all select 'consistency:'||c.id||':'||i.n,coalesce(i.issue->>'title','Document mismatch'),
        concat_ws(E'\\n',i.issue->>'detail',i.issue->>'suggestion'),'attention','consistency',c.created_at,c.project_id,p.name,
        '/projects/'||c.project_id||'?tab=deliverables' from checks c join active p on p.id=c.project_id
        cross join lateral jsonb_array_elements(c.result->'issues') with ordinality as i(issue,n)
      union all select 'consistency:'||c.id,'Documents match',coalesce(c.result->>'summary','No inconsistencies found.'),
        'done','consistency',c.created_at,c.project_id,p.name,'/projects/'||c.project_id||'?tab=deliverables'
        from checks c join active p on p.id=c.project_id where jsonb_array_length(c.result->'issues')=0
      union all select 'revision:'||b.id,'Revision drafts ready for review',b.prompt,'attention','revision',b.created_at,b.project_id,p.name,
        '/projects/'||b.project_id||'?tab=requirements&action=review-revisions' from enhancement_batches b join active p on p.id=b.project_id
        where b.state='draft' and exists(select 1 from jsonb_array_elements(b.items) i where i->>'state'='ready')
      union all select 'qa:'||r.id,'POC QA report ready',coalesce(r.report->>'summary','Review the test results.'),
        case when exists(select 1 from jsonb_array_elements(r.report->'cases') c where coalesce(c->>'error','')<>'' or exists(select 1 from jsonb_array_elements(c->'steps') s where s->>'verdict' in ('fail','no_reply') or s->>'actionCheck'='fail')) then 'attention' else 'done' end,
        'qa',r.created_at,p.id,p.name,'/projects/'||p.id||'?tab=poc'
        from poc_qa_runs r join pocs poc on poc.id=r.poc_id join active p on p.id=poc.project_id
      union all select 'suite-qa:'||r.id,'QA report: '||q.name,coalesce(r.report->>'summary','Review the test results.'),
        case when exists(select 1 from jsonb_array_elements(r.report->'cases') c where coalesce(c->>'error','')<>'' or exists(select 1 from jsonb_array_elements(c->'steps') s where s->>'verdict' in ('fail','no_reply') or s->>'actionCheck'='fail')) then 'attention' else 'done' end,
        'qa',r.created_at,null::uuid,q.name,'/qa' from qa_suite_runs r join qa_suites q on q.id=r.suite_id
      union all select 'audit:'||a.id,a.summary,a.action,'update','project',a.at,a.project_id,a.project_name,'/projects/'||a.project_id from updates a
      order by at desc`),
    query<{id:string;token:string}>('select id,token from inbox_reads'),
  ])
  const names=new Map(projects.map(p=>[p.id,p.name]))
  const readTokens=new Map(reads.map(r=>[r.id,r.token]))
  const items:InboxItem[]=rows.map(row=>({id:row.id,token:'',title:row.title,detail:row.detail,status:row.status,category:row.category,at:new Date(row.at).getTime(),projectName:row.project_name,href:row.href,read:false}))
  for(const job of jobs) {
    if(job.projectId && !names.has(job.projectId)) continue
    items.push({id:`ai:${job.id}`,token:'',title:job.task,detail:job.detail,status:job.status,category:'ai',
      at:job.finishedAt ?? job.startedAt,projectName:job.projectId ? names.get(job.projectId) : undefined,job,read:false,
      href:job.projectId ? job.documentId ? `/projects/${job.projectId}/docs/${job.documentId}` : `/projects/${job.projectId}${job.batchId ? '?action=review-revisions' : ''}` : job.task.includes('qa-suite') ? '/qa' : undefined})
  }
  if(workspace) items.push(...(await import('./systemInbox.ts')).systemInbox(workspace))
  for(const item of items) {item.token ||= notificationToken(item);item.read=readTokens.get(item.id)===item.token}
  return items.sort((a,b)=>b.at-a.at || a.id.localeCompare(b.id))
}
inbox.get('/inbox',async c=>{
  const {accountWorkspace,requireAccount}=await import('./auth.ts')
  return c.json(await loadInbox(accountWorkspace(requireAccount(c))),200,{'Cache-Control':'no-store'})
})
inbox.post('/inbox/read',async c=>{
  const input=await parseJson(c,z.object({items:z.array(z.object({id:z.string().min(1).max(180),token:z.string().min(1).max(100)})).max(5000),read:z.boolean()}))
  await withTransaction(async tx=>{
    for(const item of input.items) {
      if(input.read) await tx.query('insert into inbox_reads(id,token) values($1,$2) on conflict(id) do update set token=excluded.token',[item.id,item.token])
      else await tx.query('delete from inbox_reads where id=$1 and token=$2',[item.id,item.token])
    }
  })
  return c.body(null,204)
})
