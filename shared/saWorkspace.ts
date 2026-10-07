import {resolveSaVariables,type SaEndpoint,type SaField,type SaResponse} from './saPostman.ts'
export type SaVariable=SaField & {secret?:boolean}
export interface SaEnvironment {id:string;name:string;variables:SaVariable[];updated_at:string;version?:number}
// Higher scopes override lower scopes; disabled rows never hide a lower value.
export function scopedEndpoint(endpoint:SaEndpoint,collection:SaVariable[]=[],environment:SaVariable[]=[],session:SaVariable[]=[]):SaEndpoint {
 const values=new Map<string,SaVariable>()
 for(const scope of [collection,environment,endpoint.variables??[],session]){
  const seen=new Set<string>()
  for(const row of scope){if(row.enabled===false||!row.name.trim())continue;const name=row.name.trim();if(seen.has(name))throw new Error(`Duplicate variable: ${name}`);seen.add(name);values.set(name,{...row,name})}
 }
 return {...endpoint,variables:[...values.values()]}
}
export function jsonPath(value:unknown,path:string):unknown {
 const keys:string[]=[];let rest=path.startsWith('$')?path.slice(1):path
 while(rest){
  if(rest.startsWith('.'))rest=rest.slice(1)
  if(rest.startsWith('[')){const match=rest.match(/^\[(\d+|"(?:\\.|[^"\\])*")\]/);if(!match)throw new Error('Invalid JSON path');keys.push(match[1].startsWith('"')?JSON.parse(match[1]):match[1]);rest=rest.slice(match[0].length)}
  else{const match=rest.match(/^[^.[\]]+/);if(!match)throw new Error('Invalid JSON path');keys.push(match[0]);rest=rest.slice(match[0].length)}
 }
 return keys.reduce<unknown>((v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k)?(v as Record<string,unknown>)[k]:undefined,value)
}
export function extractVariables(endpoint:SaEndpoint,response:SaResponse):SaVariable[]{
 if(!endpoint.extracts?.length)return []
 const data=JSON.parse(response.body)
 return endpoint.extracts.map(rule=>{const value=jsonPath(data,rule.path);if(value===undefined||value===null)throw new Error(`Response variable ${rule.name}: path ${rule.path} is missing`);return {name:rule.name,value:typeof value==='string'?value:JSON.stringify(value),secret:rule.secret??true,enabled:true}})
}
export interface SaDifference {path:string;before:unknown;after:unknown;kind:'added'|'removed'|'changed'}
export function compareJson(before:unknown,after:unknown,path='$',out:SaDifference[]=[]):SaDifference[]{
 if(Object.is(before,after))return out
 if(before!==null&&after!==null&&typeof before==='object'&&typeof after==='object'&&Array.isArray(before)===Array.isArray(after)){
  const a=before as Record<string,unknown>,b=after as Record<string,unknown>
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const p=Array.isArray(before)?`${path}[${key}]`:`${path}[${JSON.stringify(key)}]`;if(!Object.hasOwn(a,key))out.push({path:p,before:undefined,after:b[key],kind:'added'});else if(!Object.hasOwn(b,key))out.push({path:p,before:a[key],after:undefined,kind:'removed'});else compareJson(a[key],b[key],p,out)}
 }else out.push({path,before,after,kind:'changed'})
 return out
}
export function resolvedDraft(endpoint:SaEndpoint){return resolveSaVariables(['GET','HEAD'].includes(endpoint.method)?{...endpoint,bodyMode:'none'}:endpoint)}
