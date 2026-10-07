import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { workspaceApi } from '../lib/api'
import { ErrorNote } from './ui'
export function DocumentEvidence({documentId,projectId,versionNo,content}:{documentId:string;projectId:string;versionNo?:number;content:unknown}) {
 const evidence=useQuery({queryKey:['document-evidence',documentId,versionNo],queryFn:()=>workspaceApi.evidence(documentId)})
 const refs=evidence.data?.find(v=>v.version_no===versionNo)?.context_refs??[]
 const tokens=[...JSON.stringify(content??{}).matchAll(/\[(source|document):([a-f0-9-]{36})(?::v(\d+))?\]/g)]
 const cited=new Set(tokens.map(t=>`${t[1]}:${t[2]}:${t[3]??''}`))
 const unknown=tokens.filter(t=>!refs.some(r=>r.kind===t[1]&&r.id===t[2]&&(t[1]==='source'||r.version===Number(t[3]))))
 return <details id="document-evidence" className="rounded-lg border border-line bg-panel p-4"><summary className="cursor-pointer text-sm font-semibold">Sources & assumptions · v{versionNo??'—'} ({refs.length} context references)</summary><p className="mt-2 text-xs leading-relaxed text-muted">These references record context available during generation. Inline citations identify claimed support; they still require human verification. Uncited statements are not automatically confirmed facts.</p><ErrorNote error={evidence.error}/>{!!unknown.length&&<p className="mt-2 text-sm text-warn">{unknown.length} citation(s) could not be matched to the recorded context. Verify them before sharing.</p>}{!refs.length&&<p className="mt-3 text-sm text-muted">No evidence snapshot recorded for this version. Earlier and manually edited versions may not have generation references.</p>}<ul className="mt-3 space-y-2">{refs.map((ref,index)=><li key={`${ref.id}:${index}`} className="rounded-lg border border-line p-3 text-sm"><Link className="font-medium text-forest underline" to={ref.kind==='document'?`/projects/${ref.projectId ?? projectId}/docs/${ref.id}`:ref.projectId === null ? '/knowledge' : `/projects/${ref.projectId ?? projectId}?tab=requirements#project-requirements`}>{ref.name}</Link><p className="mt-1 text-xs text-muted">{ref.kind==='document'?`Document version ${ref.version}`:`Source fingerprint ${ref.fingerprint?.slice(0,12)??'unavailable'}`} · {cited.has(`${ref.kind}:${ref.id}:${ref.version??''}`)?'Cited in this version':'Available context'}</p>{ref.kind === 'source' && ref.fingerprint && <SourceSnapshot fingerprint={ref.fingerprint} />}</li>)}</ul></details>
}

function SourceSnapshot({fingerprint}:{fingerprint:string}) {
 const [open,setOpen]=useState(false)
 const snapshot=useQuery({queryKey:['source-evidence',fingerprint],queryFn:()=>workspaceApi.sourceEvidence(fingerprint),enabled:open})
 return <details className="mt-2" onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer text-xs text-forest">View source as captured</summary><ErrorNote error={snapshot.error}/>{snapshot.isFetching?<p className="mt-2 text-xs text-muted">Loading snapshot...</p>:<pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{snapshot.data?.body}</pre>}</details>
}
