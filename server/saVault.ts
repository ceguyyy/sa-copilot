import {createCipheriv,createDecipheriv,randomBytes,scrypt} from 'node:crypto'
import {readFile,writeFile,rename,mkdir,rm} from 'node:fs/promises'
import path from 'node:path'
import {config} from './config.ts'
import {HttpError} from './http.ts'
import type {SaEndpoint} from '../shared/saPostman.ts'
import {z} from 'zod'

type Entries=Record<string,{value:string;updatedAt:string}>
type Envelope={version:1;salt:string;iv:string;tag:string;data:string}
// Uploads can live directly under a drive root. Keep device secrets beside
// automatic backups in the application data directory, outside upload archives.
const file=path.join(path.dirname(config.backupDir),'sapostman-vault.enc')
const legacyFile=path.join(path.dirname(config.uploadDir),'sapostman-vault.enc')
const envelopeSchema=z.object({version:z.literal(1),salt:z.string(),iv:z.string(),tag:z.string(),data:z.string()})
const entriesSchema=z.record(z.string().regex(/^[\w.-]{1,100}$/),z.object({value:z.string(),updatedAt:z.string()}))
let key:Buffer|null=null,salt:Buffer|null=null,entries:Entries={},timer:ReturnType<typeof setTimeout>|undefined
let queue:Promise<unknown>=Promise.resolve()
const serialize=<T>(fn:()=>Promise<T>):Promise<T>=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next}
async function derive(password:string,salt:Buffer):Promise<Buffer>{
  try{return await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,{N:32768,maxmem:64*1024*1024},(err,result)=>err?reject(err):resolve(result)))}
  catch{throw new HttpError(500,'Vault encryption could not be initialized. Restart the application and try again')}
}
async function envelope():Promise<Envelope|null>{
  // Continue opening existing vaults at the previous location; never silently
  // replace an existing encrypted file with an empty vault.
  for(const location of new Set([file,legacyFile])){
    let raw:string
    try{raw=await readFile(location,'utf8')}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw new HttpError(500,'Vault file could not be read. Check access to the application data folder')}
    try{
      const stored=envelopeSchema.parse(JSON.parse(raw))
      if(Buffer.from(stored.salt,'base64').length!==32||Buffer.from(stored.iv,'base64').length!==12||Buffer.from(stored.tag,'base64').length!==16)throw new Error('Invalid envelope')
      return stored
    }catch{throw new HttpError(409,'Vault file is damaged or unsupported. Keep the file and restore a valid copy before unlocking')}
  }
  return null
}
function lock(){key?.fill(0);key=null;salt=null;entries={};clearTimeout(timer)}
function touch(){clearTimeout(timer);timer=setTimeout(lock,15*60*1000);timer.unref()}
async function persist(next:Entries){
  if(!key||!salt)throw new HttpError(423,'Unlock Secret vault first')
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv)
  const data=Buffer.concat([cipher.update(JSON.stringify(next),'utf8'),cipher.final()])
  const value:Envelope={version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}
  try{
    await mkdir(path.dirname(file),{recursive:true})
    await writeFile(`${file}.tmp`,JSON.stringify(value),{mode:0o600})
    await rename(`${file}.tmp`,file)
  }catch(e){
    const code=(e as NodeJS.ErrnoException).code
    throw new HttpError(500,code==='ENOSPC'?'Vault could not be saved: the disk is full':code==='EACCES'||code==='EPERM'?'Vault could not be saved: the application data folder is not writable':'Vault could not be saved. Check the application data folder and try again')
  }
  entries=next;touch()
}
export const saVault={
  reset:(password:string)=>serialize(async()=>{
    if(password.length<12||password.length>1024)throw new HttpError(400,'Use a vault password of 12–1024 characters')
    const nextSalt=randomBytes(32),nextKey=await derive(password,nextSalt)
    const previous={key,salt,entries}
    clearTimeout(timer);key=nextKey;salt=nextSalt
    try{await persist({})}
    catch(e){nextKey.fill(0);key=previous.key;salt=previous.salt;entries=previous.entries;if(key)touch();throw e}
    previous.key?.fill(0)
    if(legacyFile!==file){
      try{await rm(legacyFile,{force:true})}
      catch{throw new HttpError(500,'New vault was created, but the previous vault file could not be removed. Check access to the old upload folder')}
    }
  }),
  status:async()=>({configured:!!await envelope(),unlocked:!!key,entries:key?Object.entries(entries).map(([name,e])=>({name,updatedAt:e.updatedAt})):[]}),
  unlock:(password:string)=>serialize(async()=>{
    const stored=await envelope()
    if(!stored){
      if(password.length<12)throw new HttpError(400,'Use a vault password of at least 12 characters')
      salt=randomBytes(32);key=await derive(password,salt)
      try{await persist({})}catch(e){lock();throw e}
    }else{
      const candidate=await derive(password,Buffer.from(stored.salt,'base64'))
      try{
        if(stored.version!==1)throw new Error('Invalid format')
        const decipher=createDecipheriv('aes-256-gcm',candidate,Buffer.from(stored.iv,'base64'));decipher.setAuthTag(Buffer.from(stored.tag,'base64'))
        const decoded=entriesSchema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(stored.data,'base64')),decipher.final()]).toString('utf8')))
        key?.fill(0);key=candidate;salt=Buffer.from(stored.salt,'base64');entries=decoded;touch()
      }catch{candidate.fill(0);throw new HttpError(403,'Incorrect vault password or damaged vault file')}
    }
  }),
  lock:()=>serialize(async()=>lock()),
  save:(name:string,value:string)=>serialize(async()=>{
    if(!key)throw new HttpError(423,'Unlock Secret vault first')
    if(!Object.hasOwn(entries,name)&&Object.keys(entries).length>=100)throw new HttpError(400,'Vault supports up to 100 secrets')
    await persist({...entries,[name]:{value,updatedAt:new Date().toISOString()}})
  }),
  remove:(name:string)=>serialize(async()=>{if(!key)throw new HttpError(423,'Unlock Secret vault first');const next={...entries};delete next[name];await persist(next)}),
}
export function vaultEndpoint(endpoint:SaEndpoint):{endpoint:SaEndpoint;secrets:string[]}{
  const scan=JSON.stringify({...endpoint,name:'',docs:'',docsHtml:''})
  const names=[...new Set([...scan.matchAll(/\{\{\s*vault\.([\w.-]+)\s*\}\}/g)].map(m=>m[1]))]
  if(!names.length)return {endpoint,secrets:[]}
  if(!key)throw new HttpError(423,'Unlock Secret vault before sending this request')
  const variables=names.map(name=>{if(!Object.hasOwn(entries,name))throw new HttpError(400,`Vault secret ${name} was not found`);return {name:`vault.${name}`,value:entries[name].value,secret:true,enabled:true}})
  touch()
  return {endpoint:{...endpoint,variables:[...(endpoint.variables??[]).filter(v=>!v.name.trim().startsWith('vault.')),...variables]},secrets:variables.map(v=>v.value)}
}
export function hideVaultValues(text:string,secrets:string[]):string{
  for(const value of [...new Set(secrets)].sort((a,b)=>b.length-a.length))if(value){
    for(const encoded of new Set([value,encodeURIComponent(value),JSON.stringify(value).slice(1,-1),Buffer.from(value).toString('base64')]))text=text.split(encoded).join('[VAULT]')
  }
  return text
}
export function hideVaultData<T>(value:T,secrets:string[]):T {
  const visit=(v:unknown):unknown=>typeof v==='string'?hideVaultValues(v,secrets):Array.isArray(v)?v.map(visit):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,item])=>[k,visit(item)])):v
  return visit(value) as T
}
