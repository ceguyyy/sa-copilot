import {useEffect, useRef, useState, type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {Pencil, FolderInput, Copy, Download, Trash2, Plus, X} from 'lucide-react'
import {Button, Input, Select, ErrorNote, Field} from './ui'
import type {SaCollection} from '../../shared/saPostman'

export function LibraryDialog({title, onClose, children}: {title:string; onClose:()=>void; children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return ()=>dialog?.close()},[])
  return createPortal(<dialog ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}} className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-line bg-panel p-0 text-ink shadow-xl backdrop:bg-black/30">
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><h2 className="min-w-0 truncate font-display text-lg font-semibold" title={title}>{title}</h2><Button variant="ghost" className="size-8 p-0!" aria-label="Close actions" icon={<X className="size-4"/>} onClick={onClose}/></div>
    <div className="space-y-3 p-3">{children}</div>
  </dialog>,document.body)
}
function Action({label, icon, onClick, danger=false, disabled=false}: {label:string;icon:ReactNode;onClick:()=>void;danger?:boolean;disabled?:boolean}) {
  return <Button variant={danger?'danger':'ghost'} disabled={disabled} className="w-full justify-start! py-2.5!" icon={icon} onClick={onClick}>{label}</Button>
}
export function SaApiActions({name, collectionId, collections, busy, onCommand, onClose}: {
  name:string;collectionId?:string|null;collections:SaCollection[];busy:boolean;onCommand:(command:string,value?:string)=>void;onClose:()=>void
}) {
  const [mode,setMode]=useState<'menu'|'rename'|'move'>('menu')
  const [draft,setDraft]=useState(name),[destination,setDestination]=useState(collectionId??'')
  const run=(command:string,value?:string)=>{onCommand(command,value);onClose()}
  return <LibraryDialog title={mode==='menu'?name:mode==='rename'?'Rename API':'Move API'} onClose={onClose}>
    {mode==='menu'?<div>
      <Action label="Rename" icon={<Pencil className="size-4"/>} disabled={busy} onClick={()=>setMode('rename')}/>
      <Action label="Move to collection" icon={<FolderInput className="size-4"/>} disabled={busy} onClick={()=>setMode('move')}/>
      <Action label="Duplicate" icon={<Copy className="size-4"/>} disabled={busy} onClick={()=>run('duplicate')}/>
      <Action label="Export" icon={<Download className="size-4"/>} disabled={busy} onClick={()=>run('export')}/>
      <div className="mt-1 border-t border-line pt-1"><Action label="Move to Trash" icon={<Trash2 className="size-4"/>} danger disabled={busy} onClick={()=>run('delete')}/></div>
    </div>:<form className="space-y-4" onSubmit={e=>{e.preventDefault();if(mode==='rename'&&!draft.trim())return;run(mode,mode==='rename'?draft:destination)}}>
      {mode==='rename'?<Field label="API name"><Input autoFocus value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy}/></Field>:<Field label="Collection"><Select autoFocus value={destination} onChange={e=>setDestination(e.target.value)} disabled={busy}><option value="">Unfiled</option>{collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={()=>setMode('menu')}>Back</Button><Button type="submit" disabled={busy||(mode==='rename'&&!draft.trim())}>{mode==='rename'?'Save':'Move'}</Button></div>
    </form>}
  </LibraryDialog>
}
export function SaCollectionManager({collections, initialId, busy, error, onCommand, onClose}: {
  collections:SaCollection[];initialId:string;busy:boolean;error:Error|null;onCommand:(command:'create'|'rename'|'export'|'delete',id:string,name?:string)=>Promise<void>;onClose:()=>void
}) {
  const [id,setId]=useState(collections.some(c=>c.id===initialId)?initialId:collections[0]?.id??'')
  const [mode,setMode]=useState<'menu'|'create'|'rename'>('menu'),[name,setName]=useState('')
  const current=collections.find(c=>c.id===id)
  return <LibraryDialog title={mode==='create'?'New collection':mode==='rename'?'Rename collection':'Collections'} onClose={onClose}>
    <ErrorNote error={error}/>
    {mode==='menu'?<><div className="flex items-center gap-2"><Select aria-label="Choose collection" value={id} disabled={busy||!collections.length} onChange={e=>setId(e.target.value)}>{!collections.length&&<option value="">No collections yet</option>}{collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select><Button variant="outline" className="size-9 shrink-0 p-0!" aria-label="Add collection" title="Add collection" icon={<Plus className="size-4"/>} disabled={busy} onClick={()=>{setName('');setMode('create')}}/></div>
      {current?<div><Action label="Rename" icon={<Pencil className="size-4"/>} disabled={busy} onClick={()=>{setName(current.name);setMode('rename')}}/><Action label="Export collection" icon={<Download className="size-4"/>} disabled={busy} onClick={()=>void onCommand('export',id)}/><div className="mt-1 border-t border-line pt-1"><Action label="Delete collection" icon={<Trash2 className="size-4"/>} danger disabled={busy} onClick={()=>void onCommand('delete',id)}/></div></div>:<p className="px-1 py-3 text-sm text-muted">Create a collection to group your APIs.</p>}
    </>:<form className="space-y-4" onSubmit={e=>{e.preventDefault();if(!name.trim())return;void onCommand(mode==='create'?'create':'rename',id,name)}}><Field label="Collection name"><Input autoFocus value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></Field><div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={()=>setMode('menu')}>Back</Button><Button type="submit" disabled={busy||!name.trim()}>{mode==='create'?'Create':'Save'}</Button></div></form>}
  </LibraryDialog>
}
