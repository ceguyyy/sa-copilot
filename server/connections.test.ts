import { mkdtempSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('./config.ts',()=>({config:{root:mkdtempSync(path.join(tmpdir(),'sa-conn-')),appVersion:'test',uploadDir:'uploads',backupDir:'backups',docsDir:'exports'}}))
import { config } from './config.ts'
import { connections, updateConnectionEnv } from './connections.ts'
import { toHttpError } from './http.ts'
const app=new Hono()
app.onError((e,c)=>{const err=toHttpError(e);return c.json({error:err.message},err.status as 400)})
app.route('/',connections)
app.get('/other',c=>c.json({ok:true}))
beforeEach(async()=>{
  vi.stubEnv('ELECTRON_RUN_AS_NODE','')
  await writeFile(path.join(config.root,'.env'),"DATABASE_URL=postgres://keep/local\nPORT=3000\n9ROUTER_API_KEY=private-old\nOUTLINE_API_KEY=keep-outline\n")
})
describe('source Connections',()=>{
  it('preserves unrelated config, literal paths and blank secrets; replaces one managed block',()=>{
    let text=updateConnectionEnv("# config\nDATABASE_URL=postgres://keep/local\nNOTION_TOKEN=keep\n",{values:{docsDir:'C:\\new\\templates'},secrets:{routerApiKey:'new#secret'}})
    text=updateConnectionEnv(text,{values:{aiModel:'custom'},secrets:{routerApiKey:''}})
    const env=parseEnv(text)
    expect(env.DATABASE_URL).toBe('postgres://keep/local')
    expect(env.NOTION_TOKEN).toBe('keep')
    expect(env.DOCS_DIR).toBe('C:\\new\\templates')
    expect(env['9ROUTER_API_KEY']).toBe('')
    expect(env.ANTHROPIC_API_KEY).toBe('')
    expect(text.match(/BEGIN SA COPILOT CONNECTIONS/g)).toHaveLength(1)
  })
  it('never sends saved secrets to the browser',async()=>{
    const response=await app.request('/connections')
    const text=await response.text()
    expect(response.status).toBe(200)
    expect(text).not.toContain('private-old')
    expect(text).not.toContain('keep-outline')
    expect(JSON.parse(text).secretsSet.routerApiKey).toBe(true)
  })
  it('persists a partial patch to ENV and keeps unrelated credentials',async()=>{
    const response=await app.request('/connections',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:{aiModel:'custom'},secrets:{routerApiKey:'replacement'}})})
    expect(response.status).toBe(200)
    const env=parseEnv(await readFile(path.join(config.root,'.env'),'utf8'))
    expect(env.DATABASE_URL).toBe('postgres://keep/local')
    expect(env.OUTLINE_API_KEY).toBe('keep-outline')
    expect(env['9ROUTER_API_KEY']).toBe('replacement')
    expect(await response.text()).not.toContain('replacement')
  })
  it('rejects invalid and cross-site writes without changing ENV',async()=>{
    const old=await readFile(path.join(config.root,'.env'),'utf8')
    const cross=await app.request('/connections',{method:'PUT',headers:{origin:'https://external.example',host:'localhost'}})
    expect(cross.status).toBe(403)
    const bad=await app.request('/connections',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:{databaseUrl:'changed'}})})
    expect(bad.status).toBe(400)
    expect(await readFile(path.join(config.root,'.env'),'utf8')).toBe(old)
  })
  it('does not apply the desktop restriction to unrelated API routes',async()=>{
    vi.stubEnv('ELECTRON_RUN_AS_NODE','1')
    expect((await app.request('/connections')).status).toBe(400)
    expect((await app.request('/other')).status).toBe(200)
  })
})
