import { createHash } from 'node:crypto'
import type { ProjectContext } from './ai/context.ts'
import { query } from './db.ts'
export async function contextEvidence(ctx: ProjectContext) {
 const sources = await Promise.all(ctx.sources.filter(s=>s.extracted_text?.trim()).map(async source=>{
  const fingerprint=createHash('sha256').update(source.extracted_text!).digest('hex')
  await query('insert into source_evidence(fingerprint,source_id,name,body) values($1,$2,$3,$4) on conflict do nothing',[fingerprint,source.id,source.name,source.extracted_text])
  return {kind:'source',id:source.id,name:source.name,projectId:source.project_id,fingerprint}
 }))
 return [...sources,...ctx.docs.map(d=>({kind:'document',id:d.id,name:d.title,projectId:ctx.project.id,version:d.version})),...ctx.knowledgeDocs.map(d=>({kind:'document',id:d.id,name:d.title,projectId:d.project_id,version:d.version}))]
}
