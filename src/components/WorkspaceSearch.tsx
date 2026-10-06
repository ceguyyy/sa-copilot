import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { workspaceApi, type SearchHit } from '../lib/api'
import { ErrorNote } from './ui'
const destination = (hit: SearchHit) => hit.kind==='project'?`/projects/${hit.id}`:hit.kind==='document'?`/projects/${hit.project_id}/docs/${hit.id}`:hit.project_id?`/projects/${hit.project_id}?tab=requirements#${hit.kind==='question'?`question-${hit.id}`:`source-${hit.id}`}`:`/knowledge#source-${hit.id}`
export function WorkspaceSearchButton() {
 return <button type="button" onClick={() => window.dispatchEvent(new Event('open-workspace-search'))} className="inline-flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-ink transition hover:border-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"><Search className="size-4" /><span>Search workspace</span><kbd className="hidden text-[10px] text-muted sm:inline">Ctrl / ⌘ K</kbd></button>
}
export function WorkspaceSearch() {
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[term,setTerm]=useState('')
 const dialog=useRef<HTMLDialogElement>(null)
 const results=useQuery({queryKey:['workspace-search',term],queryFn:()=>workspaceApi.search(term),enabled:open&&term.length>=2})
 useEffect(()=>{const timer=setTimeout(()=>setTerm(text.trim()),250);return()=>clearTimeout(timer)},[text])
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(v=>!v)}};const show=()=>setOpen(true);window.addEventListener('keydown',key);window.addEventListener('open-workspace-search',show);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('open-workspace-search',show)}},[])
 return <>
 <dialog ref={dialog} onCancel={()=>setOpen(false)} onClick={e=>{if(e.target===dialog.current)setOpen(false)}} className="m-auto w-[min(92vw,680px)] rounded-xl border border-line bg-panel p-0 text-ink shadow-xl backdrop:bg-black/40"><div className="flex items-center gap-3 border-b border-line p-4"><Search className="size-5 text-muted"/><input autoFocus aria-label="Search projects, sources, questions and documents" placeholder="Search projects, requirements, questions, documents..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={text} onChange={e=>setText(e.target.value)}/><button type="button" aria-label="Close search" onClick={()=>setOpen(false)}><X className="size-5"/></button></div><div className="max-h-[60vh] overflow-auto p-3"><ErrorNote error={results.error}/>{term.length<2?<p className="p-3 text-sm text-muted">Enter at least two characters to search your workspace.</p>:results.isFetching?<p className="p-3 text-sm text-muted">Searching...</p>:!results.data?.length?<p className="p-3 text-sm text-muted">No matching items.</p>:results.data.map(hit=><Link key={`${hit.kind}:${hit.id}`} to={destination(hit)} onClick={()=>setOpen(false)} className="block rounded-lg p-3 hover:bg-forest-soft"><span className="text-xs uppercase text-muted">{hit.kind}</span><p className="break-words text-sm font-medium">{hit.title}</p><p className="mt-1 line-clamp-2 text-xs text-muted">{hit.excerpt}</p></Link>)}</div></dialog></>
}
