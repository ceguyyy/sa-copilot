import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Hono } from 'hono'
import { z } from 'zod'
import type { PoolClient } from 'pg'
import type { EnhancementBatch, EnhancementItem, EnhancementTarget } from '../shared/enhancement.ts'
import { DOC_LABELS, validateContent } from '../shared/schemas.ts'
import { query, queryOne, withTransaction } from './db.ts'
import { cleanScenario } from './demo.ts'
import { exportDocumentFiles } from './exports.ts'
import { HttpError, idParam, notFound, parseJson } from './http.ts'

export async function enhancementInventory(projectId: string): Promise<EnhancementItem[]> {
  notFound(await queryOne('select id from projects where id = $1 and deleted_at is null', [projectId]), 'Project')
  const [docs, sources, demos] = await Promise.all([
    query<EnhancementItem>(`select d.id, d.title, d.type as "docType", v.content, v.id as "versionId", v.version_no as "versionNo"
      from documents d join lateral (select id, version_no, content from document_versions where document_id=d.id order by version_no desc limit 1) v on true
      where d.project_id=$1 order by d.created_at`, [projectId]),
    query<{ id: string; name: string; kind: string; storage_path: string | null; extracted_text: string | null; enabled: boolean }>('select * from sources where project_id=$1 and deleted_at is null order by created_at', [projectId]),
    query<{ id: string; payload: Record<string, unknown> }>('select id, payload from demo_scenarios where project_id=$1 order by created_at', [projectId]),
  ])
  return [
    ...docs.map(d => ({ ...d, key: `document:${d.id}`, kind: 'document' as const, editable: true, category: d.docType === 'diagram' ? 'Diagrams' : d.docType === 'custom' ? 'Custom' : 'Deliverables', title: `${DOC_LABELS[d.docType!]}: ${d.title}` })),
    ...sources.map(s => ({ id: s.id, key: `source:${s.id}`, kind: 'source' as const, title: s.name, category: s.kind === 'requirement' ? 'Requirements' : 'Knowledge & files', editable: !s.storage_path && !!s.extracted_text, content: s.extracted_text ?? '' })),
    ...demos.map(d => ({ id: d.id, key: `demo:${d.id}`, kind: 'demo' as const, title: String(d.payload.title ?? d.payload.name ?? 'Demo scenario'), category: 'Demo', editable: true, content: d.payload })),
  ]
}

export async function loadEnhancement(id: string): Promise<EnhancementBatch> {
  return notFound(await queryOne<EnhancementBatch>('select * from enhancement_batches where id=$1', [id]), 'Revision batch')
}

export function validateProposal(item: EnhancementItem, proposed: unknown): unknown {
  if (item.kind === 'source') {
    if (typeof proposed !== 'string' || !proposed.trim() || proposed.length > 2_000_000) throw new HttpError(422, 'Revised requirement must contain text')
  } else if (item.kind === 'document') {
    const error = validateContent(item.docType!, proposed)
    if (error) throw new HttpError(422, error)
  } else return cleanScenario(proposed)
  return proposed
}

export function assertUnchanged(item: EnhancementTarget, current: EnhancementItem | undefined, undo: boolean) {
  const expectedVersion = undo ? item.appliedVersionId : item.versionId
  if (!current || !isDeepStrictEqual(current.content, undo ? item.proposed : item.content) || (item.kind === 'document' && current.versionId !== expectedVersion)) {
    throw new HttpError(409, `${item.title} changed since ${undo ? 'this batch was applied' : 'the draft was created'}. ${undo ? 'Undo was cancelled to preserve later edits.' : 'Create a new batch with the latest data.'}`)
  }
}

async function writeItem(tx: PoolClient, item: EnhancementTarget, content: unknown, batch: EnhancementBatch, undo: boolean) {
  if (item.kind === 'document') {
    const refs: Record<string,unknown>[] = []
    if (undo && item.versionId) {
      const previous = (await tx.query('select context_refs from document_versions where id=$1',[item.versionId])).rows[0]
      refs.push(...(previous?.context_refs ?? []))
    } else {
      const context = [...new Map([...batch.context,...batch.items].map(ref=>[ref.key,ref])).values()]
      for (const ref of context) {
        if (ref.kind === 'source' && typeof ref.content === 'string') {
          const fingerprint = createHash('sha256').update(ref.content).digest('hex')
          await tx.query('insert into source_evidence(fingerprint,source_id,name,body) values($1,$2,$3,$4) on conflict do nothing',[fingerprint,ref.id,ref.title,ref.content])
          refs.push({kind:'source',id:ref.id,name:ref.title,projectId:batch.project_id,fingerprint})
        } else if (ref.kind === 'document') refs.push({kind:'document',id:ref.id,name:ref.title,projectId:batch.project_id,version:ref.versionNo})
      }
    }
    const { rows } = await tx.query<{ id: string }>('insert into document_versions (document_id, content, origin, note, context_refs) values ($1,$2,$3,$4,$5) returning id', [item.id, content, undo ? 'restore' : 'ai', `${undo ? 'Undo' : 'Enhancement'} batch ${batch.id}: ${batch.prompt.slice(0, 500)}`,JSON.stringify(refs)])
    if (!undo) item.appliedVersionId = rows[0].id
  } else if (item.kind === 'source') await tx.query('update sources set extracted_text=$2 where id=$1', [item.id, content])
  else await tx.query('update demo_scenarios set payload=$2, pushed_at=null where id=$1', [item.id, content])
}

export async function applyEnhancement(id: string, accepted: string[], undo = false) {
  const batch = await withTransaction(async tx => {
    await tx.query('set transaction isolation level serializable')
    const { rows } = await tx.query<EnhancementBatch>('select * from enhancement_batches where id=$1 for update', [id])
    const b = notFound(rows[0] ?? null, 'Revision batch')
    if (b.state !== (undo ? 'applied' : 'draft')) throw new HttpError(409, 'This batch cannot be applied or undone in its current state')
    const keys = undo ? b.accepted : [...new Set(accepted)]
    if (!keys.length || keys.some(key => !b.items.some(i => i.key === key && i.state === 'ready'))) throw new HttpError(400, 'Select ready revision items')
    if (!undo && (!b.report || !b.review || !isDeepStrictEqual([...b.review_keys].sort(), [...keys].sort()) || b.report.conflicts.some(c => !b.resolutions[c.id]?.trim()) || b.review.conflicts.length)) throw new HttpError(400, 'Analyze, resolve conflicts and check the selected previews before applying')
    // Locks protect all-or-nothing writes; serializable isolation also detects concurrent version inserts.
    const chosen = b.items.filter(i => keys.includes(i.key)).sort((a, z) => a.key.localeCompare(z.key))
    for (const item of chosen) {
      const table = item.kind === 'document' ? 'documents' : item.kind === 'source' ? 'sources' : 'demo_scenarios'
      const locked = await tx.query(`select id from ${table} where id=$1 and project_id=$2 for update`, [item.id, b.project_id])
      if (!locked.rows.length) throw new HttpError(409, `${item.title} no longer exists`)
      let current: EnhancementItem
      if (item.kind === 'document') {
        const { rows: versions } = await tx.query<{ id: string; content: unknown }>('select id, content from document_versions where document_id=$1 order by version_no desc limit 1', [item.id])
        current = { ...item, content: versions[0]?.content, versionId: versions[0]?.id }
      } else {
        const column = item.kind === 'source' ? 'extracted_text' : 'payload'
        const { rows: values } = await tx.query(`select ${column} as content from ${table} where id=$1`, [item.id])
        current = { ...item, content: values[0].content }
      }
      assertUnchanged(item, current, undo)
      await writeItem(tx, item, undo ? item.content : validateProposal(item, item.proposed), b, undo)
    }
    b.state = undo ? 'undone' : 'applied'
    b.accepted = keys
    await tx.query('update enhancement_batches set state=$2, accepted=$3, items=$4 where id=$1', [id, b.state, JSON.stringify(keys), JSON.stringify(b.items)])
    await tx.query('select audit($1,$2,$3,$4)', [b.project_id, undo ? 'enhancement.undo' : 'enhancement.apply', `${undo ? 'Undid' : 'Applied'} ${keys.length} revisions: ${b.prompt.slice(0, 160)}`, JSON.stringify({ batchId: id, items: keys })])
    return b
  })
  for (const item of batch.items.filter(i => batch.accepted.includes(i.key) && i.kind === 'document')) {
    exportDocumentFiles(item.id).catch(e => console.error('Enhancement auto-export failed:', e))
  }
  return batch
}

const keys = z.array(z.string().max(80)).min(1).max(200)
export const enhancement = new Hono()
enhancement.get('/projects/:id/enhancement/items', async c => c.json(await enhancementInventory(idParam(c))))
enhancement.get('/projects/:id/enhancement/batches', async c => c.json(await query<EnhancementBatch>('select * from enhancement_batches where project_id=$1 order by created_at desc', [idParam(c)])))
enhancement.get('/enhancement/:id', async c => c.json(await loadEnhancement(idParam(c))))
enhancement.post('/projects/:id/enhancement/batches', async c => {
  const projectId = idParam(c)
  const req = await parseJson(c, z.object({ prompt: z.string().trim().min(1).max(8000), rules: z.string().max(8000), targets: keys, context: z.array(z.string().max(80)).max(200) }))
  const inventory = await enhancementInventory(projectId)
  if (req.targets.some(k => !inventory.some(i => i.key === k && i.editable)) || req.context.some(k => !inventory.some(i => i.key === k))) throw new HttpError(400, 'Invalid target or context selection')
  return c.json(await queryOne('insert into enhancement_batches (project_id,prompt,rules,context,items) values ($1,$2,$3,$4,$5) returning *', [projectId, req.prompt, req.rules, JSON.stringify(inventory.filter(i => req.context.includes(i.key))), JSON.stringify(inventory.filter(i => req.targets.includes(i.key)).map(i => ({ ...i, state: 'pending' })))]), 201)
})
enhancement.patch('/enhancement/:id/resolutions', async c => {
  const req = await parseJson(c, z.object({ resolutions: z.record(z.string().max(80), z.string().trim().min(1).max(4000)) }))
  const b = await loadEnhancement(idParam(c))
  if (b.state !== 'draft' || b.items.some(i => i.state === 'ready')) throw new HttpError(409, 'Resolve conflicts before generating previews')
  return c.json(await queryOne('update enhancement_batches set resolutions=$2, review=null where id=$1 returning *', [b.id, JSON.stringify(req.resolutions)]))
})
enhancement.post('/enhancement/:id/apply', async c => {
  const req = await parseJson(c, z.object({ accepted: keys }))
  return c.json(await applyEnhancement(idParam(c), req.accepted))
})
enhancement.post('/enhancement/:id/undo', async c => c.json(await applyEnhancement(idParam(c), [], true)))
