import {useState} from 'react'
import {GripVertical} from 'lucide-react'

export function SaSplitDivider({value,onChange}:{value:number;onChange:(width:number)=>void}){
 const [dragging,setDragging]=useState(false)
 const resize=(element:HTMLDivElement,clientX:number)=>{
  const bounds=element.parentElement?.getBoundingClientRect()
  if(!bounds)return
  // Two 16px gaps plus the 8px separator sit outside the flexible columns.
  const available=bounds.width-40
  if(available<=0)return
  onChange(Math.round(Math.max(25,Math.min(75,(clientX-bounds.left-20)/available*100))))
 }
 return <div role="separator" aria-label="Resize request and response" aria-orientation="vertical" aria-valuenow={value} aria-valuemin={25} aria-valuemax={75} aria-valuetext={`Request ${value}%, response ${100-value}%`} tabIndex={0} title="Drag to resize · double-click to reset · arrow keys to adjust" className={`relative hidden cursor-col-resize touch-none select-none items-center justify-center self-stretch rounded @min-[820px]:flex ${dragging?'bg-forest-soft':'hover:bg-forest-soft focus-visible:bg-forest-soft'}`} onPointerDown={ev=>{if(ev.button!==0)return;ev.preventDefault();ev.currentTarget.setPointerCapture(ev.pointerId);setDragging(true)}} onPointerMove={ev=>{if(ev.currentTarget.hasPointerCapture(ev.pointerId))resize(ev.currentTarget,ev.clientX)}} onPointerUp={ev=>{if(ev.currentTarget.hasPointerCapture(ev.pointerId))ev.currentTarget.releasePointerCapture(ev.pointerId);setDragging(false)}} onPointerCancel={()=>setDragging(false)} onLostPointerCapture={()=>setDragging(false)} onDoubleClick={()=>onChange(50)} onKeyDown={ev=>{if(ev.key==='ArrowLeft'||ev.key==='ArrowRight'){ev.preventDefault();onChange(Math.max(25,Math.min(75,value+(ev.key==='ArrowRight'?1:-1)*(ev.shiftKey?1:5))))}if(ev.key==='Home'){ev.preventDefault();onChange(50)}}}>
  <span className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${dragging?'bg-forest':'bg-line'}`}/><span className="sticky top-1/2 z-10 rounded border border-line bg-panel py-2"><GripVertical className="size-3 text-muted"/></span>
 </div>
}
