import {useState} from 'react'
import type {SaEndpoint} from '../../shared/saPostman'
import {Input} from './ui'
import {SaVariableCues} from './SaVariableCues'

export function SaUrlField({endpoint,busy,onChange,onSave}:{endpoint:SaEndpoint;busy:boolean;onChange:(url:string)=>void;onSave:(variables:NonNullable<SaEndpoint['variables']>)=>Promise<void>}){
 const [editing,setEditing]=useState(false)
 const parts=endpoint.url.split(/(\{\{\s*[\w.-]+\s*\}\})/g)
 if(editing||parts.length===1)return <Input autoFocus={editing} aria-label="Request URL" className="min-w-0 font-mono" disabled={busy} value={endpoint.url} onChange={ev=>onChange(ev.target.value)} onBlur={()=>setEditing(false)} placeholder="https://workflows.cekat.ai/webhook/…"/>
 return <div role="textbox" aria-label="Request URL" aria-readonly="true" tabIndex={busy?-1:0} onFocus={ev=>{if(ev.target===ev.currentTarget)setEditing(true)}} className="min-w-0 break-all rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm">
  {parts.map((part,i)=>{const match=part.match(/^\{\{\s*([\w.-]+)\s*\}\}$/);return match?<SaVariableCues key={i} endpoint={endpoint} busy={busy} inlineName={match[1]} onSave={onSave}/>:<span key={i} onClick={()=>{if(!busy)setEditing(true)}}>{part}</span>})}
  <button type="button" disabled={busy} aria-label="Edit request URL" className="ml-2 text-xs text-muted underline" onClick={()=>setEditing(true)}>Edit URL</button>
 </div>
}
