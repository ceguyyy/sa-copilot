import { Hono } from 'hono'
import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { DEFAULT_SKILLS } from '../src/lib/defaultSkills.ts'
import { query, queryOne, withTransaction } from './db.ts'
import { HttpError, idParam, parseJson } from './http.ts'

export const workspace = new Hono()
const key = (skill: unknown) => createHash('sha256').update(JSON.stringify(skill)).digest('hex').slice(0, 12)
workspace.get('/skills/releases', async c => {
 const skills = await query<{ id: string; name: string; output_type: string; instructions: string; description: string; updated_at: string; release_key: string | null; builtin_name: string; baseline: unknown }>('select s.*, r.release_key,r.builtin_name,r.baseline from skills s left join skill_releases r on r.skill_id=s.id')
 return c.json(DEFAULT_SKILLS.map(builtin => ({ release: key(builtin), builtin, installed: skills.filter(s => s.output_type===builtin.output_type && (s.name===builtin.name || s.builtin_name===builtin.name || s.release_key===key(builtin))).map(s => ({...s, customized: s.baseline ? !isDeepStrictEqual({name:s.name,description:s.description,instructions:s.instructions},s.baseline) : s.instructions!==builtin.instructions, available: s.release_key!==key(builtin) && (s.instructions!==builtin.instructions || s.description!==builtin.description || s.name!==builtin.name) })) })))
})
workspace.post('/skills/releases/apply', async c => {
 const input=await parseJson(c,z.object({release:z.string(),mode:z.enum(['copy','replace']),id:z.string().uuid().optional(),expected:z.string().optional()}))
 const builtin=DEFAULT_SKILLS.find(s=>key(s)===input.release)
 if(!builtin) throw new HttpError(409,'This built-in release changed. Refresh the preview.')
 return c.json(await withTransaction(async tx=>{
  let row
  if(input.mode==='replace') {
   if(!input.id||!input.expected) throw new HttpError(400,'Choose an installed skill and preview it first.')
   const current=(await tx.query('select * from skills where id=$1 for update',[input.id])).rows[0]
   if(!current || new Date(current.updated_at).toISOString()!==new Date(input.expected).toISOString()) throw new HttpError(409,'Skill changed. Refresh the preview before applying.')
   if(current.output_type!==builtin.output_type) throw new HttpError(400,'Skill output types must match.')
   row=(await tx.query('update skills set name=$2,description=$3,instructions=$4 where id=$1 returning *',[input.id,builtin.name,builtin.description,builtin.instructions])).rows[0]
  }else{
   row=(await tx.query('insert into skills(name,output_type,description,instructions,is_default) values($1,$2,$3,$4,false) returning *',[`${builtin.name} (${input.release.slice(0,6)})`.slice(0,120),builtin.output_type,builtin.description,builtin.instructions])).rows[0]
  }
  await tx.query('insert into skill_releases(skill_id,release_key,baseline,builtin_name) values($1,$2,$3,$4) on conflict(skill_id) do update set release_key=excluded.release_key,baseline=excluded.baseline,builtin_name=excluded.builtin_name,updated_at=now()',[row.id,input.release,JSON.stringify({name:row.name,description:row.description,instructions:row.instructions}),builtin.name])
  return row
 }))
})
workspace.get('/skills/:id/history',async c=>c.json(await query('select * from skill_history where skill_id=$1 order by created_at desc limit 100',[idParam(c)])))
workspace.get('/workspace/search',async c=>{
 const term=(c.req.query('q')??'').trim().slice(0,120)
 if(term.length<2)return c.json([])
 const pattern=`%${term.replace(/[\\%_]/g,'\\$&')}%`
 return c.json(await query(`select * from (
 select 'project' as kind,id, id as project_id,name as title,client_name as excerpt,updated_at as at from projects where deleted_at is null and archived_at is null and (name ilike $1 or client_name ilike $1)
 union all select 'source',id,project_id,name,left(extracted_text,180),created_at from sources where deleted_at is null and (project_id is null or exists(select 1 from projects p where p.id=project_id and p.deleted_at is null and p.archived_at is null)) and (name ilike $1 or extracted_text ilike $1)
 union all select 'question',id,project_id,question,left(context,180),updated_at from open_questions q where exists(select 1 from projects p where p.id=q.project_id and p.deleted_at is null and p.archived_at is null) and (question ilike $1 or answer ilike $1)
 union all select 'document',d.id,d.project_id,d.title,left(v.content::text,180),d.updated_at from documents d left join lateral(select content from document_versions where document_id=d.id order by version_no desc limit 1)v on true where exists(select 1 from projects p where p.id=d.project_id and p.deleted_at is null and p.archived_at is null) and (d.title ilike $1 or v.content::text ilike $1)
 ) hits order by at desc limit 50`,[pattern]))
})
workspace.get('/projects/:id/review-alerts',async c=>c.json(await query(`select r.*,coalesce(d.title,s.payload->>'title','Demo scenario') as title from review_alerts r left join documents d on r.target_kind='document' and d.id=r.target_id left join demo_scenarios s on r.target_kind='demo' and s.id=r.target_id where r.project_id=$1 and r.reviewed_at is null and (d.id is not null or s.id is not null) order by r.changed_at desc`,[idParam(c)])))
workspace.post('/review-alerts/:id/reviewed',async c=>{
 const input=await parseJson(c,z.object({change_no:z.number().int().positive()}))
 const row=await queryOne('update review_alerts set reviewed_at=now() where id=$1 and change_no=$2 and reviewed_at is null returning id',[idParam(c),input.change_no])
 if(!row)throw new HttpError(409,'The dependency changed again. Refresh and review the latest version.')
 return c.json(row)
})
workspace.get('/documents/:id/evidence',async c=>{
 const versions=await query<{version_no:number;context_refs:unknown[]}>('select version_no,context_refs from document_versions where document_id=$1 order by version_no desc',[idParam(c)])
 return c.json(versions)
})

workspace.get('/evidence/sources/:fingerprint',async c=>{
 const fingerprint=c.req.param('fingerprint');
 if(!/^[a-f0-9]{64}$/.test(fingerprint))throw new HttpError(400,'Invalid source fingerprint');
 const snapshot=await queryOne('select name,body,captured_at from source_evidence where fingerprint=$1',[fingerprint]);
 if(!snapshot)throw new HttpError(404,'Source snapshot not found');
 return c.json(snapshot);
})
