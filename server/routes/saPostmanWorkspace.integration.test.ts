import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest'
import { Hono } from 'hono'
import { createServer,type Server } from 'node:http'
import { endpointFromRequest } from '../../shared/saPostman.ts'
const url=process.env.TEST_DATABASE_URL
if(url&&!new URL(url).pathname.endsWith('_test'))throw new Error('Only a _test database is allowed')
vi.mock('../ai/models.ts',()=>({activeModel:vi.fn().mockResolvedValue({id:'test/model'})}))
vi.mock('../ai/llm/index.ts',()=>({runModel:vi.fn().mockResolvedValue({text:'{"explanation":"Test diagnosis","curl":"curl https://example.com","docs":"# Endpoint"}'})}))
describe.skipIf(!url)('SAPostman workspace with PostgreSQL',()=>{
 let app:Hono,db:typeof import('../db.ts'),server:Server,target:string
 beforeAll(async()=>{
  process.env.DATABASE_URL=url!;process.env['9ROUTER_API_KEY']='test-only'
  db=await import('../db.ts');await db.setupDatabase()
  await db.query('truncate sa_requests,sa_request_versions,sa_send_history,sa_collections,sa_environments cascade')
  const {saPostmanWorkspace}=await import('./saPostmanWorkspace.ts')
  app=new Hono();app.onError((err,c)=>c.json({error:err.message},(err as {status?:400}).status??500));app.route('/api',saPostmanWorkspace)
  server=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{res.setHeader('Content-Type','application/json');res.statusCode=201;res.end(JSON.stringify({ok:true,body:JSON.parse(body||'{}')}))})})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));target=`http://127.0.0.1:${(server.address() as {port:number}).port}/hook`
 },30000)
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db?.pool.end()})
 const request=(path:string,method='GET',body?:unknown)=>app.request('/api/sapostman'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
 it('saves, updates with conflict detection, loads old versions and deletes',async()=>{
  const e={...endpointFromRequest({url:target}),name:'Ticket API'}
  const created=await (await request('/requests','POST',e)).json();expect(created.version).toBe(1)
  const updated=await (await request(`/requests/${created.id}`,'PUT',{expectedVersion:1,config:{...e,docs:'New docs'}})).json();expect(updated.version).toBe(2)
  expect((await request(`/requests/${created.id}`,'PUT',{expectedVersion:1,config:e})).status).toBe(409)
  const versions=await (await request(`/requests/${created.id}/versions`)).json();expect(versions.map((v:{version:number})=>v.version)).toEqual([2,1])
  await request(`/requests/${created.id}`,'PUT',{expectedVersion:2,config:versions[1].config})
  expect((await (await request('/requests')).json())[0].version).toBe(3)
  await request(`/requests/${created.id}`,'DELETE');expect(await (await request('/requests')).json()).toEqual([])
  expect(await (await request(`/requests/${created.id}/versions`)).json()).toEqual([])
 })
 it('sends to a real local endpoint and persists success, errors and assertions',async()=>{
  const e={...endpointFromRequest({url:target,method:'POST',body:'{"action":"ticket"}',headers:[{name:'Authorization',value:'Bearer private-token'}]}),name:'Create ticket'}
  e.scripts.post='[{"name":"Created","target":"status","equals":201}]'
  const result=await (await request('/execute','POST',e)).json();expect(result.response.status).toBe(201);expect(result.checks[0].passed).toBe(true)
  const sent=await (await request(`/history/${result.historyId}`)).json();expect(sent.request.headers[0].value).toBe('[REDACTED]');expect(sent.response.body).toContain('ticket')
  const failed=await (await request('/execute','POST',{...e,url:'http://127.0.0.1:1'})).json();expect(failed.error).toBeTruthy();expect(failed.historyId).toBeTruthy()
  expect((await (await request('/history')).json()).length).toBe(2)
  await request(`/history/${result.historyId}`,'DELETE');expect((await (await request('/history')).json()).length).toBe(1)
 })
 it('returns AI suggestions without executing them',async()=>{
  const result=await (await request('/assist','POST',{mode:'trace',prompt:'Why did it fail?',endpoint:endpointFromRequest({url:target}),response:'{}',error:'401 Unauthorized'})).json()
  expect(result.explanation).toBe('Test diagnosis');expect(result.docs).toBe('# Endpoint')
 })
 it('keeps saved endpoints and version history through backup/restore',async()=>{
  const e={...endpointFromRequest({url:target}),name:'Portable endpoint'}
  const saved=await (await request('/requests','POST',e)).json()
  const {createBackup,restoreBackup}=await import('../backup/service.ts')
  const backup=await createBackup();expect(backup.manifest.tables.sa_requests).toBe(1)
  await request(`/requests/${saved.id}`,'DELETE')
  await restoreBackup(backup.data)
  expect((await (await request('/requests')).json())[0].id).toBe(saved.id)
  expect((await (await request(`/requests/${saved.id}/versions`)).json()).length).toBe(1)
 })
 it('groups endpoints in collections and exports docs with credentials redacted',async()=>{
  const collection=await(await request('/collections','POST',{name:'Weather'})).json()
  const endpoint={...endpointFromRequest({url:target}),name:'Forecast',collectionId:collection.id,docs:'API docs',docsHtml:'<p><u>API docs</u></p>'}
  endpoint.auth={...endpoint.auth,type:'bearer',token:'private-token'}
  const saved=await(await request('/requests','POST',endpoint)).json()
  const exported=await(await request(`/collections/${collection.id}/export`)).json()
  expect(exported.name).toBe('Weather');expect(exported.endpoints[0].docsHtml).toContain('<u>');expect(exported.endpoints[0].auth.token).toBe('')
  expect((await request(`/collections/${collection.id}`,'DELETE')).status).toBe(409)
  await request(`/collections/${collection.id}`,'PUT',{name:'Weather APIs'})
  expect((await(await request('/collections')).json())[0].name).toBe('Weather APIs')
  const backup=await(await import('../backup/service.ts')).createBackup();expect(backup.manifest.tables.sa_collections).toBe(1)
  await request(`/requests/${saved.id}`,'DELETE');await request(`/collections/${collection.id}`,'DELETE')
  expect(await(await request('/collections')).json()).toEqual([])
 })
 it('persists scoped variables, imports atomically, previews without sending, and backs environments up',async()=>{
  const env=await(await request('/environments','POST',{name:'Dev',variables:[{name:'base',value:target}]})).json()
  const envBody={name:'Staging',variables:[{name:'base',value:target}],expectedUpdatedAt:env.updated_at,expectedVersion:env.version}
  expect((await request(`/environments/${env.id}`,'PUT',envBody)).status).toBe(200)
  expect((await request(`/environments/${env.id}`,'PUT',envBody)).status).toBe(409)
  const imported=await(await request('/import','POST',{name:'Imported',variables:[{name:'credential',value:'private-value'}],endpoints:[{...endpointFromRequest({url:'{{base}}'}),name:'Ping',auth:{...endpointFromRequest().auth,type:'bearer',token:'{{credential}}'}}]})).json()
  expect(imported.count).toBe(1)
  const col=imported.collection
  const updated=await request(`/collections/${col.id}`,'PUT',{name:col.name,variables:[{name:'credential',value:'private-value'}],expectedVersion:col.version,expectedUpdatedAt:col.updated_at})
  expect(updated.status).toBe(200)
  expect((await request(`/collections/${col.id}`,'PUT',{name:'Stale',variables:[],expectedVersion:col.version})).status).toBe(409)
  const exported=await(await request(`/collections/${col.id}/export`)).json();expect(exported.variables[0].value).toBe('[REDACTED]')
  const historyBefore=await(await request('/history')).json()
  const preview=await(await request('/preview','POST',{...endpointFromRequest({url:'{{base}}'}),variables:[{name:'base',value:target}],params:[{name:'a',value:'a b'}]})).json()
  expect(preview.url).toContain('a=a+b');expect((await(await request('/history')).json()).length).toBe(historyBefore.length)
  const countBefore=(await(await request('/collections')).json()).length
  expect((await request('/import','POST',{name:'Invalid',endpoints:[{...endpointFromRequest(),name:''}]})).status).toBe(400)
  expect((await(await request('/collections')).json()).length).toBe(countBefore)
  const {createBackup,restoreBackup}=await import('../backup/service.ts');const backup=await createBackup();expect(backup.manifest.tables.sa_environments).toBe(1)
  await request(`/environments/${env.id}`,'DELETE');await restoreBackup(backup.data)
  expect((await(await request('/environments')).json())[0].name).toBe('Staging')
 })
})
