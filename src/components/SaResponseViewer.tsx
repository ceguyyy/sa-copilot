import type {SaPreferences} from '../lib/saPreferences'
import {useState,useMemo} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Button,Input,Select,ErrorNote} from './ui'
import {CopyButton} from './CopyButton'
import {compareJson} from '../../shared/saWorkspace'
import type {SaResponse,SaCheck,SaHistory} from '../../shared/saPostman'
import {saPostmanApi} from '../lib/api'
function JsonNode({value,path,label,search,expanded,epoch,depth,openDepth,wordWrap,searchPaths}:{value:unknown;path:string;label:string;search:string;expanded:boolean;epoch:number;depth:number;openDepth:number;wordWrap:boolean;searchPaths:Set<string>}){
 const [open,setOpen]=useState(epoch?expanded:depth<openDepth),[limit,setLimit]=useState(100)
 const object=value!==null&&typeof value==='object'
 const text=object?'':JSON.stringify(value)
 const entries=useMemo(()=>object?Object.entries(value as object):[],[value,object])
 const matches=!search||searchPaths.has(path)
 if(!matches)return null
 return <div className="min-w-0 border-l border-line pl-3 font-mono">{object?<details key={epoch} open={!!search||open} onToggle={ev=>setOpen(ev.currentTarget.open)}><summary className="cursor-pointer py-1"><span>{label} {Array.isArray(value)?`[${value.length}]`:`{${entries.length}}`}</span><CopyButton compact text={path} label="Copy JSON path" title={path}/></summary>{(open||!!search)&&entries.slice(0,limit).map(([key,v])=><JsonNode key={key} value={v} label={key} path={Array.isArray(value)?`${path}[${key}]`:`${path}[${JSON.stringify(key)}]`} search={search.trim()} expanded={expanded} epoch={epoch} depth={depth+1} openDepth={openDepth} wordWrap={wordWrap} searchPaths={searchPaths}/>) }{entries.length>limit&&(open||search)&&<Button variant="ghost" onClick={()=>setLimit(v=>v+100)}>Show 100 more fields</Button>}</details>:<div className="flex min-w-0 items-center gap-2 py-1"><span className="min-w-0" style={{whiteSpace:wordWrap?'pre-wrap':'pre',overflowWrap:wordWrap?'anywhere':'normal'}}>{label}: {text}</span><CopyButton compact text={path} label="Copy JSON path" title={path}/></div>}</div>
}
export function SaResponseViewer({response,checks,previous,history,preferences}:{preferences:SaPreferences;response:SaResponse;checks:SaCheck[];previous:SaResponse|null;history:(Omit<SaHistory,'response'>&{summary:{status?:number;durationMs?:number}})[]}){
 const [tab,setTab]=useState<string>(preferences.responseView),[search,setSearch]=useState(''),[expanded,setExpanded]=useState(true),[epoch,setEpoch]=useState(0),[compareId,setCompareId]=useState('previous')
 const baseline=useQuery({queryKey:['sa-compare',compareId],queryFn:()=>saPostmanApi.historyItem(compareId),enabled:tab==='compare'&&compareId!=='previous'&&!!compareId})
 const before=compareId==='previous'?previous:baseline.data?.response??null
 const parsed=useMemo(()=>{try{return {data:JSON.parse(response.body) as unknown,json:true}}catch{return {data:null,json:false}}},[response.body])
 const {data,json}=parsed
 const beforeParsed=useMemo(()=>{if(tab!=='compare'||!before)return null;try{return {data:JSON.parse(before.body) as unknown,json:true}}catch{return {data:before.body,json:false}}},[tab,before?.body])
 const changes=useMemo(()=>tab==='compare'&&beforeParsed?compareJson(beforeParsed.data,json?data:response.body):[],[tab,beforeParsed,json,data,response.body])
 const pretty=useMemo(()=>tab==='raw'||(tab==='tree'&&!json)?json?JSON.stringify(data,null,2):response.body:'',[tab,json,data,response.body])
 const searchPaths=useMemo(()=>{
   const matches=new Set<string>(),query=search.trim().toLowerCase()
   if(!query||tab!=='tree')return matches
   const visit=(value:unknown,path:string,label:string):boolean=>{
     const object=value!==null&&typeof value==='object'
     let found=`${label} ${path} ${object?'':JSON.stringify(value)}`.toLowerCase().includes(query)
     if(object)for(const [key,item] of Object.entries(value))if(visit(item,Array.isArray(value)?`${path}[${key}]`:`${path}[${JSON.stringify(key)}]`,key))found=true
     if(found)matches.add(path)
     return found
   }
   visit(data,'$','$');return matches
 },[data,search,tab])
 return <div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><strong className={response.status>=400?'text-bad':'text-ok'}>{response.status} {response.statusText}</strong><span className="font-mono text-xs text-muted">{response.durationMs} ms · {response.bytes} bytes</span><span className={checks.some(c=>!c.passed)?'text-bad':'text-ok'}>{checks.filter(c=>c.passed).length}/{checks.length} checks passed</span><CopyButton text={response.body} label="Copy response"/></div>{response.truncated&&<p className="text-warn">Response truncated at 2 MB.</p>}<div className="flex flex-wrap gap-1">{['tree','raw','headers','checks','compare'].map(t=><Button key={t} variant={tab===t?'primary':'ghost'} onClick={()=>setTab(t)}>{t==='compare'?'Compare':t}</Button>)}</div>{tab==='tree'&&json?<><div className="flex flex-wrap gap-2"><div className="w-full"><Input aria-label="Search response JSON" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search field or value"/></div><Button variant="outline" onClick={()=>{setExpanded(false);setEpoch(v=>v+1)}}>Collapse JSON</Button><Button variant="outline" onClick={()=>{setExpanded(true);setEpoch(v=>v+1)}}>Expand JSON</Button></div><div className="max-h-[600px] overflow-auto" style={{fontSize:preferences.fontSize}}><JsonNode key={epoch} value={data} path="$" label="$" search={search.trim()} expanded={expanded} epoch={epoch} depth={0} openDepth={preferences.jsonDepth} wordWrap={preferences.wordWrap} searchPaths={searchPaths}/></div></>:tab==='checks'?<div>{checks.length?checks.map((c,i)=><p key={i} className={c.passed?'text-ok':'text-bad'}>{c.passed?'PASS':'FAIL'} · {c.name} · actual {JSON.stringify(c.actual)}, expected {JSON.stringify(c.expected)}</p>):'No assertions configured.'}</div>:tab==='compare'?<div className="space-y-3"><Select aria-label="Comparison baseline" value={compareId} onChange={e=>setCompareId(e.target.value)}><option value="previous">Previous response in this tab</option>{history.map(h=><option key={h.id} value={h.id}>{h.name} · {h.summary.status??'failed'} · {new Date(h.created_at).toLocaleString()}</option>)}</Select><ErrorNote error={baseline.error}/>{baseline.isFetching&&<p>Loading baseline…</p>}{before?<><p className="text-sm">Status {before.status} → {response.status} · duration {before.durationMs} → {response.durationMs} ms · size {before.bytes} → {response.bytes} bytes</p>{changes.length?<div className="max-h-[500px] overflow-auto">{changes.map((d,i)=><div key={i} className="mb-2 rounded border border-line p-2 font-mono text-xs"><p>{d.kind} · {d.path}</p><p className="break-all text-bad">− {JSON.stringify(d.before)??'(missing)'}</p><p className="break-all text-ok">+ {JSON.stringify(d.after)??'(missing)'}</p></div>)}</div>:<p className="text-sm text-ok">No body changes.</p>}</>:<p className="text-sm text-muted">Send twice in this tab or select a history response to compare.</p>}</div>:<pre className="max-h-[600px] overflow-auto rounded bg-panel p-3 font-mono" style={{fontSize:preferences.fontSize,whiteSpace:preferences.wordWrap?'pre-wrap':'pre',overflowWrap:preferences.wordWrap?'anywhere':'normal'}} >{tab==='headers'?JSON.stringify(response.headers,null,2):pretty||'(empty response)'}</pre>}</div>
}
