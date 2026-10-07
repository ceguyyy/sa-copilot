import { useState } from 'react'
import { Button, Input } from './ui'
import type { SaEndpoint } from '../../shared/saPostman'
import {endpointFromRequest,resolveSaVariables} from '../../shared/saPostman'

export function SaVariableCues({endpoint,busy,onSave,inlineName}:{endpoint:SaEndpoint;busy:boolean;inlineName?:string;onSave:(variables:NonNullable<SaEndpoint['variables']>)=>Promise<void>}){
  const text=[endpoint.url,...endpoint.params.filter(r=>r.enabled!==false).map(r=>r.value),...endpoint.headers.filter(r=>r.enabled!==false).map(r=>r.value),endpoint.body,endpoint.graphqlVariables,...Object.values(endpoint.auth),endpoint.scripts.pre,endpoint.scripts.post].join(' ')
  const names=inlineName?[inlineName]:[...new Set([...text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(m=>m[1]))]
  const [active,setActive]=useState<string|null>(null),[value,setValue]=useState(''),[secret,setSecret]=useState(false)
  const open=(name:string)=>{if(active===name)return;const row=endpoint.variables?.find(v=>v.name.trim()===name);setActive(name);setValue(row?.value??'');setSecret(row?.secret??false)}
  if(!names.length)return null
  return <span className={inlineName?'inline':'flex flex-wrap items-center gap-2'} aria-label="Request variables">{!inlineName&&<span className="text-xs text-muted">Variables</span>}{names.map(name=>{
    const row=endpoint.variables?.find(v=>v.name.trim()===name&&v.enabled!==false)
    let valid=!!row?.value.trim()
    try{resolveSaVariables({...endpointFromRequest({url:`{{${name}}}`}),variables:endpoint.variables})}catch{valid=false}
    return <span key={name} className="relative inline-block" onMouseEnter={()=>{if(!busy)open(name)}}>
      <button type="button" disabled={busy} aria-expanded={active===name} aria-label={`Edit variable ${name}`} data-valid={valid} onFocus={()=>open(name)} onClick={()=>open(name)} className={`rounded whitespace-nowrap font-mono ${inlineName?'px-0.5 text-sm':'border px-2 py-1 text-xs'} ${valid?'border-green-600 bg-green-100 text-green-800':'border-red-400 bg-red-50 text-red-700'}`}>{`{{${name}}}`} {!valid&&!inlineName?'· invalid':''}</button>
      {active===name&&<div role="dialog" aria-label={`Variable ${name}`} className="absolute left-0 top-full z-30 mt-1 w-72 space-y-3 rounded-lg border border-line bg-panel p-3 shadow-xl">
        <div className="flex items-center justify-between"><strong className="font-mono text-sm">{name}</strong><button aria-label="Close variable editor" onClick={()=>setActive(null)}>×</button></div>
        <Input autoFocus aria-label={`Value for ${name}`} disabled={busy||name.startsWith('vault.')} type={secret?'password':'text'} value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setActive(null)}}/>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={secret} disabled={busy||name.startsWith('vault.')} onChange={e=>setSecret(e.target.checked)}/>Secret value</label>
        <p className="text-xs text-muted">{name.startsWith('vault.')?'Manage this secret using the Vault button. Its value stays on the local server.':'Save updates this endpoint and adds a version.'}</p>
        <Button disabled={name.startsWith('vault.')} loading={busy} onClick={()=>{
          const variables=[...(endpoint.variables??[])],index=variables.findIndex(v=>v.name.trim()===name)
          const next={...(index<0?{}:variables[index]),name,value,secret,enabled:true}
          if(index<0)variables.push(next);else variables[index]=next
          void onSave(variables).then(()=>setActive(null)).catch(()=>{})
        }}>Save variable</Button>
      </div>}
    </span>
  })}</span>
}
