import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'
import EmbeddedPostgres from 'embedded-postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EnhancementBatch } from '../shared/enhancement.ts'

const model = vi.hoisted(() => vi.fn())
vi.mock('./exports.ts', () => ({ exportDocumentFiles: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./ai/structured.ts', async original => ({ ...await original<typeof import('./ai/structured.ts')>(), runStructured: model }))

describe('project enhancement (isolated PostgreSQL)', () => {
  let pg: EmbeddedPostgres
  let db: typeof import('./db.ts')
  let svc: typeof import('./enhancement.ts')
  let ai: typeof import('./ai/enhancement.ts')
  let projectId: string
  let docId: string
  let sourceId: string
  let uploadedId: string
  const report = { summary: 'Consistent', conflicts: [], impacts: [], issues: [] }
  const before = { rows: [{ requirement: 'Before' }] }
  const after = { rows: [{ requirement: 'After' }] }

  beforeAll(async () => {
    const port = await new Promise<number>(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const address = server.address(); const port = typeof address === 'object' && address ? address.port : 0; server.close(() => resolve(port)) }) })
    pg = new EmbeddedPostgres({ databaseDir: path.join(mkdtempSync(path.join(tmpdir(), 'sa-enhancement-')), 'pg'), user: 'postgres', password: 'test-password', port, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} })
    await pg.initialise(); await pg.start(); await pg.createDatabase('enhancement_test')
    vi.stubEnv('DATABASE_URL', `postgresql://postgres:test-password@127.0.0.1:${port}/enhancement_test`)
    db = await import('./db.ts'); svc = await import('./enhancement.ts'); ai = await import('./ai/enhancement.ts')
    svc.enhancement.onError((e, c) => c.json({ error: e.message }, ((e as { status?: number }).status ?? 500) as 400))
    await db.setupDatabase()
    projectId = (await db.query<{ id: string }>("insert into projects (name,client_name) values ('Enhancement','Test') returning id"))[0].id
    docId = (await db.query<{ id: string }>("insert into documents (project_id,type,title) values ($1,'tor','TOR') returning id", [projectId]))[0].id
    await db.query('insert into document_versions (document_id,content) values ($1,$2)', [docId, before])
    sourceId = (await db.query<{ id: string }>("insert into sources (project_id,kind,name,extracted_text) values ($1,'requirement','Requirement','Original requirement') returning id", [projectId]))[0].id
    uploadedId = (await db.query<{ id: string }>("insert into sources (project_id,kind,name,extracted_text,storage_path) values ($1,'knowledge','Brief.pdf','Original uploaded reference','brief.pdf') returning id", [projectId]))[0].id
  }, 60000)
  afterAll(async () => { await db?.pool.end(); await pg?.stop(); vi.unstubAllEnvs() }, 30000)

  async function create(targets = [`document:${docId}`, `source:${sourceId}`]) {
    const res = await svc.enhancement.request(`/projects/${projectId}/enhancement/batches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Align all scope', rules: 'Preserve prices', targets, context: [`source:${uploadedId}`] }) })
    expect(res.status).toBe(201)
    return await res.json() as EnhancementBatch
  }
  async function ready() {
    let batch = await create()
    batch.items = batch.items.map(i => ({ ...i, state: 'ready', proposed: i.kind === 'document' ? after : 'Revised requirement', summary: 'Updated scope' }))
    await db.query('update enhancement_batches set items=$2,report=$3,review=$3,review_keys=$4 where id=$1', [batch.id, JSON.stringify(batch.items), report, JSON.stringify(batch.items.map(i => i.key))])
    return svc.loadEnhancement(batch.id)
  }
  it('lists editable sources/documents and keeps uploaded files read-only, excluding POC', async () => {
    const items = await svc.enhancementInventory(projectId)
    expect(items.find(i => i.id === uploadedId)).toMatchObject({ editable: false, kind: 'source' })
    expect(items.find(i => i.id === sourceId)).toMatchObject({ editable: true })
    expect(items.some(i => String(i.kind) === 'poc')).toBe(false)
    const res = await svc.enhancement.request(`/projects/${projectId}/enhancement/batches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Revise', rules: '', targets: [`source:${uploadedId}`], context: [] }) })
    expect(res.status).toBe(400)
  })
  it('exposes revision items and history through the mounted /api routes', async () => {
    const { Hono } = await import('hono')
    const { api } = await import('./routes.ts')
    const app = new Hono().route('/api', api)
    const items = await app.request(`/api/projects/${projectId}/enhancement/items`)
    expect(items.status).toBe(200)
    expect(await items.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: docId })]))
    const history = await app.request(`/api/projects/${projectId}/enhancement/batches`)
    expect(history.status).toBe(200)
    expect(await history.json()).toEqual(expect.any(Array))
  })
  it('applies selected revisions atomically and restores contents as new document versions', async () => {
    const b = await ready()
    const applied = await svc.applyEnhancement(b.id, b.items.map(i => i.key))
    expect(applied.state).toBe('applied')
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === docId)?.content).toEqual(after)
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === sourceId)?.content).toBe('Revised requirement')
    await svc.applyEnhancement(b.id, [], true)
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === docId)?.content).toEqual(before)
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === sourceId)?.content).toBe('Original requirement')
    expect((await db.query('select * from document_versions where document_id=$1', [docId])).length).toBe(3)
  })
  it('requires a consistency review of the exact accepted selection', async () => {
    const b = await ready()
    await expect(svc.applyEnhancement(b.id, [b.items[0].key])).rejects.toMatchObject({ status: 400 })
    await db.query('update enhancement_batches set review_keys=$2 where id=$1', [b.id, JSON.stringify([b.items[0].key])])
    await svc.applyEnhancement(b.id, [b.items[0].key])
    await svc.applyEnhancement(b.id, [], true)
  })
  it('refuses unresolved conflicts and stale originals without partial writes', async () => {
    const b = await ready()
    await db.query('update enhancement_batches set report=$2 where id=$1', [b.id, { ...report, conflicts: [{ id: 'price', detail: 'Different prices', question: 'Which price?' }] }])
    await expect(svc.applyEnhancement(b.id, b.items.map(i => i.key))).rejects.toMatchObject({ status: 400 })
    await db.query('update enhancement_batches set report=$2 where id=$1', [b.id, report])
    await db.query('update sources set extracted_text=$2 where id=$1', [sourceId, 'Later edit'])
    await expect(svc.applyEnhancement(b.id, b.items.map(i => i.key))).rejects.toMatchObject({ status: 409 })
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === docId)?.content).toEqual(before)
    expect((await svc.loadEnhancement(b.id)).state).toBe('draft')
    await db.query('update sources set extracted_text=$2 where id=$1', [sourceId, 'Original requirement'])
  })
  it('blocks undo after later edits and retains the complete applied batch', async () => {
    const b = await ready()
    await svc.applyEnhancement(b.id, b.items.map(i => i.key))
    await db.query('insert into document_versions (document_id,content) values ($1,$2)', [docId, { rows: [{ requirement: 'Later edit' }] }])
    await expect(svc.applyEnhancement(b.id, [], true)).rejects.toMatchObject({ status: 409 })
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === sourceId)?.content).toBe('Revised requirement')
    expect((await svc.loadEnhancement(b.id)).state).toBe('applied')
    await db.query('insert into document_versions (document_id,content) values ($1,$2)', [docId, before])
    await db.query('update sources set extracted_text=$2 where id=$1', [sourceId, 'Original requirement'])
  })
  it('persists failed previews and retries only the requested item with explicit context', async () => {
    let b = await create([`document:${docId}`])
    const out = { send: vi.fn() }
    model.mockResolvedValueOnce({ data: report, model: { id: 'test' } })
    await ai.enhanceProject({ batchId: b.id, action: 'analyze' }, out)
    model.mockRejectedValueOnce(new Error('Provider timeout'))
    await ai.enhanceProject({ batchId: b.id, action: 'preview', key: b.items[0].key }, out)
    expect((await svc.loadEnhancement(b.id)).items[0]).toMatchObject({ state: 'failed', error: 'Provider timeout' })
    model.mockResolvedValueOnce({ data: { content: after, summary: 'Aligned scope' }, model: { id: 'test' } })
    await ai.enhanceProject({ batchId: b.id, action: 'preview', key: b.items[0].key }, out)
    b = await svc.loadEnhancement(b.id)
    expect(b.items[0]).toMatchObject({ state: 'ready', proposed: after })
    expect(b.context.map(i => i.id)).toEqual([uploadedId])
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === docId)?.content).toEqual(before)
    const { Hono } = await import('hono')
    const { api } = await import('./routes.ts')
    const response = await new Hono().route('/api', api).request('/api/dashboard')
    const dashboard = await response.json() as { id: string; revision_drafts: number }[]
    expect(dashboard.find(p => p.id === projectId)?.revision_drafts).toBeGreaterThan(0)
  })
  async function conflicted() {
    const b = await ready()
    const conflict = { id: 'scope', detail: 'TOR still includes B2B while the brief requires B2C', question: 'Which scope should prevail?', targetKeys: [`document:${docId}`] }
    await db.query('update enhancement_batches set review=$2 where id=$1', [b.id, { ...report, conflicts: [conflict] }])
    return svc.loadEnhancement(b.id)
  }
  it('repairs a conflict in only the chosen preview, persists the decision, then requires a fresh review before apply', async () => {
    model.mockReset()
    const b = await conflicted()
    const docKey = `document:${docId}`
    const repaired = { rows: [{ requirement: 'After, limited to B2C' }] }
    const out = { send: vi.fn() }
    model.mockResolvedValueOnce({ data: { content: repaired, summary: 'Remove B2B; keep earlier changes' }, model: { id: 'test' } })
    await ai.enhanceProject({ batchId: b.id, action: 'repair', conflictId: 'scope', decision: 'B2C only', keys: [docKey], accepted: b.review_keys }, out)
    const fixed = await svc.loadEnhancement(b.id)
    expect(fixed.id).toBe(b.id)
    expect(fixed.items.find(i => i.key === docKey)).toMatchObject({ state: 'ready', content: before, proposed: repaired })
    expect(fixed.items.find(i => i.id === sourceId)).toEqual(b.items.find(i => i.id === sourceId))
    expect(fixed.review).toBeNull()
    expect(fixed.review_keys).toEqual([])
    expect(Object.values(fixed.resolutions).join()).toContain('B2C only')
    expect(model.mock.calls[0][0].system.join()).toContain(JSON.stringify(after))
    expect(model.mock.calls[0][0].task).toContain('CURRENT PROPOSED content')
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === docId)?.content).toEqual(before)
    await expect(svc.applyEnhancement(b.id, b.review_keys)).rejects.toMatchObject({ status: 400 })
    model.mockResolvedValueOnce({ data: report, model: { id: 'test' } })
    await ai.enhanceProject({ batchId: b.id, action: 'review', accepted: b.review_keys }, out)
    expect(model.mock.calls[1][0].system.join()).toContain('B2C only')
    await svc.applyEnhancement(b.id, b.review_keys)
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === docId)?.content).toEqual(repaired)
    await svc.applyEnhancement(b.id, [], true)
  })
  it('validates conflict, selection and editable target boundaries before repairing', async () => {
    model.mockReset()
    const b = await conflicted()
    const req = { batchId: b.id, action: 'repair', conflictId: 'scope', decision: 'B2C only', keys: [`document:${docId}`], accepted: b.review_keys }
    const out = { send: vi.fn() }
    await expect(ai.enhanceProject({ ...req, conflictId: 'missing' }, out)).rejects.toMatchObject({ status: 400 })
    await expect(ai.enhanceProject({ ...req, accepted: [`document:${docId}`] }, out)).rejects.toMatchObject({ status: 400 })
    await expect(ai.enhanceProject({ ...req, keys: [`source:${uploadedId}`] }, out)).rejects.toMatchObject({ status: 400 })
    await expect(ai.enhanceProject({ ...req, keys: ['document:missing'] }, out)).rejects.toMatchObject({ status: 400 })
    await expect(ai.enhanceProject({ ...req, decision: '  ' }, out)).rejects.toBeDefined()
    await expect(ai.enhanceProject({ ...req, keys: [] }, out)).rejects.toBeDefined()
    await db.query('update enhancement_batches set review_keys=$2 where id=$1', [b.id, JSON.stringify([`document:${docId}`])])
    await expect(ai.enhanceProject({ ...req, accepted: [`document:${docId}`], keys: [`source:${sourceId}`] }, out)).rejects.toMatchObject({ status: 400 })
    await db.query("update enhancement_batches set state='applied' where id=$1", [b.id])
    await expect(ai.enhanceProject(req, out)).rejects.toMatchObject({ status: 409 })
    expect(model).not.toHaveBeenCalled()
  })
  it('keeps every earlier preview and the review if any targeted repair fails, then supports a retry', async () => {
    model.mockReset()
    const b = await conflicted()
    const docKey = `document:${docId}`
    const sourceKey = `source:${sourceId}`
    const repaired = { rows: [{ requirement: 'B2C only' }] }
    const req = { batchId: b.id, action: 'repair', conflictId: 'scope', decision: 'B2C only', keys: [docKey, sourceKey], accepted: b.review_keys }
    const out = { send: vi.fn() }
    model.mockResolvedValueOnce({ data: { content: repaired, summary: 'Limit scope' }, model: { id: 'test' } }).mockRejectedValueOnce(new Error('Provider timeout'))
    await expect(ai.enhanceProject(req, out)).rejects.toThrow('Provider timeout')
    expect(await svc.loadEnhancement(b.id)).toEqual(b)
    expect(model.mock.calls[1][0].system.join()).toContain(JSON.stringify(repaired))
    model.mockResolvedValueOnce({ data: { content: repaired, summary: 'Limit scope' }, model: { id: 'test' } }).mockResolvedValueOnce({ data: { content: 'B2C requirement', summary: 'Limit scope' }, model: { id: 'test' } })
    await ai.enhanceProject(req, out)
    expect((await svc.loadEnhancement(b.id)).items.map(i => i.proposed)).toEqual([repaired, 'B2C requirement'])
    expect((await svc.enhancementInventory(projectId)).find(i => i.id === sourceId)?.content).toBe('Original requirement')
  })
  it('rejects invalid repaired document content without losing the current preview', async () => {
    model.mockReset()
    const b = await conflicted()
    model.mockResolvedValueOnce({ data: { content: 'Invalid TOR', summary: 'Invalid' }, model: { id: 'test' } })
    await expect(ai.enhanceProject({ batchId: b.id, action: 'repair', conflictId: 'scope', decision: 'B2C only', keys: [`document:${docId}`], accepted: b.review_keys }, { send: vi.fn() })).rejects.toMatchObject({ status: 422 })
    expect(await svc.loadEnhancement(b.id)).toEqual(b)
  })
  it('maps review conflicts only to accepted editable targets and excludes unaccepted proposals during repair', async () => {
    model.mockReset()
    const b = await ready()
    const docKey = `document:${docId}`
    const out = { send: vi.fn() }
    model.mockResolvedValueOnce({ data: { ...report, conflicts: [{ id: 'scope', detail: 'B2B in TOR', question: 'Which scope?', targetKeys: [docKey, docKey, `source:${sourceId}`, `source:${uploadedId}`, 'document:missing'] }] }, model: { id: 'test' } })
    await ai.enhanceProject({ batchId: b.id, action: 'review', accepted: [docKey] }, out)
    expect((await svc.loadEnhancement(b.id)).review?.conflicts[0].targetKeys).toEqual([docKey])
    model.mockResolvedValueOnce({ data: { content: after, summary: 'Fix scope' }, model: { id: 'test' } })
    await ai.enhanceProject({ batchId: b.id, action: 'repair', conflictId: 'scope', decision: 'B2C only', keys: [docKey], accepted: [docKey] }, out)
    const context = JSON.parse(model.mock.calls[1][0].system[3])
    expect(context.existingProposals.map((i: { key: string }) => i.key)).toEqual([docKey])
    expect(context.revisionTargets.find((i: { key: string }) => i.key === `source:${sourceId}`).content).toBe('Original requirement')
  })
  it('revises demo payloads locally and restores their previous content without publishing', async () => {
    const payload = { name: 'Support', title: 'Customer Support', steps: [{ userReply: 'Hello', aiResponse: 'Welcome' }] }
    const demoId = (await db.query<{ id: string }>('insert into demo_scenarios (project_id,payload,pushed_at) values ($1,$2,now()) returning id', [projectId, payload]))[0].id
    let b = await create([`demo:${demoId}`])
    const proposed = svc.validateProposal(b.items[0], { ...payload, title: 'Support and CSAT' })
    b.items[0] = { ...b.items[0], state: 'ready', proposed, summary: 'Add CSAT' }
    await db.query('update enhancement_batches set items=$2,report=$3,review=$3,review_keys=$4 where id=$1', [b.id, JSON.stringify(b.items), report, JSON.stringify(b.items.map(i => i.key))])
    b = await svc.applyEnhancement(b.id, b.items.map(i => i.key))
    const current = (await db.query<{ payload: Record<string, unknown>; pushed_at: string | null }>('select payload,pushed_at from demo_scenarios where id=$1', [demoId]))[0]
    expect(current.payload.title).toBe('Support and CSAT')
    expect(current.pushed_at).toBeNull()
    await svc.applyEnhancement(b.id, [], true)
    expect((await db.query<{ payload: unknown }>('select payload from demo_scenarios where id=$1', [demoId]))[0].payload).toEqual(payload)
  })
  it('bulk drops and deletes questions only within the requested project, atomically', async () => {
    const { Hono } = await import('hono')
    const { questions } = await import('./routes/questions.ts')
    const { toHttpError } = await import('./http.ts')
    const app = new Hono().route('/api', questions)
    app.onError((e, c) => { const err = toHttpError(e); return c.json({ error: err.message }, err.status as 400) })
    const rows = await db.query<{ id: string }>("insert into open_questions (project_id,question) values ($1,'One'),($1,'Two') returning id", [projectId])
    const other = (await db.query<{ id: string }>("insert into projects (name,client_name) values ('Other','Other') returning id"))[0]
    const foreign = (await db.query<{ id: string }>("insert into open_questions (project_id,question) values ($1,'Foreign') returning id", [other.id]))[0]
    const request = (ids: string[], action: 'drop' | 'delete') => app.request(`/api/projects/${projectId}/questions/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, action }) })
    expect((await request([rows[0].id, foreign.id], 'delete')).status).toBe(409)
    expect((await db.query('select * from open_questions where id=any($1::uuid[])', [rows.map(r => r.id)])).length).toBe(2)
    const dropped = await request([rows[0].id, rows[1].id, rows[0].id], 'drop')
    expect(dropped.status).toBe(200)
    expect(await dropped.json()).toEqual({ affected: 2 })
    expect((await db.query<{ status: string }>('select status from open_questions where project_id=$1', [projectId])).every(r => r.status === 'dropped')).toBe(true)
    expect((await request(rows.map(r => r.id), 'delete')).status).toBe(200)
    expect((await db.query('select * from open_questions where project_id=$1', [projectId])).length).toBe(0)
    expect((await db.query('select * from open_questions where id=$1', [foreign.id])).length).toBe(1)
    expect((await request([], 'drop')).status).toBe(400)
  })
})
