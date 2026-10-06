import { Hono } from 'hono'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'
import path from 'node:path'
import { config } from './config.ts'
import { HttpError } from './http.ts'
import { parsePatch } from '../electron/config.ts'
import { SECRET_KEYS, VALUE_KEYS, type ConfigPatch } from '../electron/settings.ts'
import type { DesktopStatus } from '../electron/bridge.ts'
import { CONNECTION_ENV_VALUES, CONNECTION_ENV_SECRETS } from '../shared/connectionEnv.ts'

const START = '# BEGIN SA COPILOT CONNECTIONS'
const END = '# END SA COPILOT CONNECTIONS'
const file = () => path.join(config.root, '.env')
async function readEnv() {
  try { return await readFile(file(),'utf8') }
  catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw e }
}

/** Literal quoting preserves Windows paths, hashes, and passwords without shell expansion. */
function quote(value:string) {
  const delimiter = ["'",'`','"'].find(q=>!value.includes(q))
  if (!delimiter) throw new HttpError(400,'A connection value contains unsupported quote characters.')
  const quoted=`${delimiter}${value}${delimiter}`
  if (parseEnv(`VALUE=${quoted}`).VALUE !== value) throw new HttpError(400,'A connection value cannot be represented safely in ENV format.')
  return quoted
}

export function updateConnectionEnv(text:string, patch:ConfigPatch):string {
  const existing=parseEnv(text)
  const managed:Record<string,string>={}
  for (const [env,key] of Object.entries(CONNECTION_ENV_VALUES)) {
    if (existing[env] !== undefined) managed[env]=existing[env]
    if (patch.values?.[key] !== undefined) managed[env]=patch.values[key]!
  }
  for (const [env,key] of Object.entries(CONNECTION_ENV_SECRETS)) {
    if (existing[env] !== undefined) managed[env]=existing[env]
    // Set both router aliases so removing or replacing a key cannot fall back to an old key.
    if (patch.secrets?.[key] !== undefined) managed[env]=patch.secrets[key]!
  }
  const start=text.indexOf(START)
  const end=text.indexOf(END)
  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) throw new HttpError(409,'The Connections block in .env is incomplete. Repair it before saving.')
  const original=start < 0 ? text : text.slice(0,start)+text.slice(end+END.length)
  return `${original.trimEnd()}\n\n${START}\n${Object.entries(managed).map(([key,value])=>`${key}=${quote(value)}`).join('\n')}\n${END}\n`
}

async function status(text?:string):Promise<DesktopStatus> {
  const env={...process.env,...parseEnv(text ?? await readEnv())}
  const values=Object.fromEntries(VALUE_KEYS.map(key=>[key,''])) as DesktopStatus['values']
  for (const [name,key] of Object.entries(CONNECTION_ENV_VALUES)) values[key]=env[name] ?? ''
  const secretsSet=Object.fromEntries(SECRET_KEYS.map(key=>[key,false])) as DesktopStatus['secretsSet']
  for (const [name,key] of Object.entries(CONNECTION_ENV_SECRETS)) secretsSet[key] ||= !!env[name]
  return {configured:secretsSet.routerApiKey,values,secretsSet,routerDashboardUrl:'',routerExternal:true,
    dataDir:config.root,version:config.appVersion,folders:{data:config.root,database:'Managed by DATABASE_URL',uploads:config.uploadDir,backups:config.backupDir,logs:'Server console',exports:config.docsDir}}
}

export const connections = new Hono()
connections.use('/connections',async(c,next)=>{
  if (process.env.ELECTRON_RUN_AS_NODE === '1') throw new HttpError(400,'Manage desktop connections through the app settings.')
  const origin=c.req.header('origin')
  if (c.req.header('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== c.req.header('host'))) throw new HttpError(403,'Connection settings must come from SA Copilot')
  c.header('Cache-Control','no-store')
  await next()
})
connections.get('/connections',async c=>c.json(await status()))
// Serialize saves so two tabs cannot overwrite each other's unrelated settings.
let saving=Promise.resolve()
connections.put('/connections',async c=>{
  const body=await c.req.json().catch(()=>{throw new HttpError(400,'Invalid JSON body')})
  let patch:ConfigPatch
  try { patch=parsePatch(body) } catch(e) { throw new HttpError(400,e instanceof Error ? e.message : 'Invalid connections') }
  let result:DesktopStatus | undefined
  const next=saving.then(async()=>{
    const updated=updateConnectionEnv(await readEnv(),patch)
    const tmp=`${file()}.${randomUUID()}.tmp`
    await writeFile(tmp,updated,{mode:0o600})
    await rename(tmp,file())
    result=await status(updated)
  })
  saving=next.catch(()=>{})
  await next
  return c.json(result)
})
