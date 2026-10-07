import {useEffect,useRef} from 'react'
import {sanitizeSaDocs} from '../lib/saDocs'
import {marked} from 'marked'
import {Button,Select} from './ui'

export function SaDocsEditor({docs,html,disabled,onChange}:{docs:string;html?:string;disabled:boolean;onChange:(docs:string,html:string)=>void}){
 const ref=useRef<HTMLDivElement>(null),last=useRef(''),range=useRef<Range|null>(null)
 useEffect(()=>{const content=sanitizeSaDocs(html||marked.parse(docs,{async:false}));if(ref.current&&last.current!==content){ref.current.innerHTML=content;last.current=content;range.current=null}},[docs,html])
 const remember=()=>{const selection=window.getSelection();if(selection?.rangeCount&&ref.current?.contains(selection.anchorNode))range.current=selection.getRangeAt(0).cloneRange()}
 const changed=()=>{if(ref.current){const content=sanitizeSaDocs(ref.current.innerHTML);last.current=content;onChange(ref.current.innerText??ref.current.textContent??'',content)}}
 const command=(name:string,value?:string)=>{ref.current?.focus();if(range.current){const s=window.getSelection();s?.removeAllRanges();s?.addRange(range.current)}document.execCommand(name,false,value);remember();changed()}
 return <div className="space-y-2"><div role="toolbar" aria-label="Documentation formatting" className="flex flex-wrap gap-1 rounded border border-line bg-panel p-2">
  <Select aria-label="Font family" disabled={disabled} className="max-w-40" defaultValue="Arial" onMouseDown={remember} onChange={e=>command('fontName',e.target.value)}>{['Arial','Georgia','Times New Roman','Courier New','Verdana'].map(f=><option key={f}>{f}</option>)}</Select>
  <Select aria-label="Text size" disabled={disabled} className="max-w-24" defaultValue="3" onMouseDown={remember} onChange={e=>command('fontSize',e.target.value)}>{[['1','10'],['2','13'],['3','16'],['4','18'],['5','24'],['6','32'],['7','48']].map(([v,label])=><option key={v} value={v}>{label} px</option>)}</Select>
  <Select aria-label="Paragraph style" disabled={disabled} className="max-w-32" defaultValue="p" onMouseDown={remember} onChange={e=>command('formatBlock',e.target.value)}>{['p','h1','h2','h3','blockquote','pre'].map(t=><option key={t} value={t}>{t==='p'?'Paragraph':t}</option>)}</Select>
  {[['bold','Bold'],['italic','Italic'],['underline','Underline'],['strikeThrough','Strike'],['insertUnorderedList','Bullets'],['insertOrderedList','Numbering'],['justifyLeft','Left'],['justifyCenter','Center'],['justifyRight','Right'],['removeFormat','Clear format'],['undo','Undo'],['redo','Redo']].map(([cmd,label])=><Button key={cmd} variant="outline" disabled={disabled} onMouseDown={e=>{e.preventDefault();remember()}} onClick={()=>command(cmd)}>{label}</Button>)}
  <label className="flex items-center gap-1 text-xs">Color<input type="color" disabled={disabled} aria-label="Text color" onMouseDown={remember} onChange={e=>command('foreColor',e.target.value)}/></label>
 </div><div ref={ref} role="textbox" aria-label="Endpoint documentation" aria-multiline="true" contentEditable={!disabled} suppressContentEditableWarning onInput={changed} onMouseUp={remember} onKeyUp={remember} className="prose prose-sm min-h-72 max-w-none overflow-auto rounded border border-line bg-panel p-4 focus:outline-none"/></div>
}
