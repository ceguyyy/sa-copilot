import {Rows2, Columns2, RotateCcw} from 'lucide-react'
import {Button, Field, Select, Input} from './ui'
import {DEFAULT_SA_PREFERENCES, type SaPreferences} from '../lib/saPreferences'

export function SaWorkspaceSettings({value, onChange, onClose}: {
  value: SaPreferences; onChange: (next: Partial<SaPreferences>) => void; onClose: () => void
}) {
  return <section aria-label="Workspace settings" className="space-y-4 rounded-xl border border-line bg-panel p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">Workspace settings</h2><Button variant="ghost" onClick={onClose}>Close</Button></div>
    <div className="flex flex-wrap gap-2"><Button variant={value.layout==='vertical'?'primary':'outline'} icon={<Rows2 className="size-4"/>} aria-pressed={value.layout==='vertical'} onClick={()=>onChange({layout:'vertical'})}>Top down</Button><Button variant={value.layout==='horizontal'?'primary':'outline'} icon={<Columns2 className="size-4"/>} aria-pressed={value.layout==='horizontal'} onClick={()=>onChange({layout:'horizontal'})}>Side by side</Button></div>
    {value.layout==='horizontal'&&<label className="flex flex-wrap items-center gap-3 text-sm">Request width<input aria-label="Request panel width" className="accent-forest" type="range" min="25" max="75" value={value.width} onChange={e=>onChange({width:Number(e.target.value)})}/><span className="font-mono text-xs">{value.width}%</span><Button variant="outline" onClick={()=>onChange({width:50})}>Reset 50:50</Button></label>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Field label="Density"><Select value={value.density} onChange={e=>onChange({density:e.target.value as SaPreferences['density']})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></Select></Field>
      <Field label={`Editor font size · ${value.fontSize}px`}><input className="w-full accent-forest" aria-label="Editor font size" type="range" min="10" max="22" value={value.fontSize} onChange={e=>onChange({fontSize:Number(e.target.value)})}/></Field>
      <Field label="Long text"><Select value={value.wordWrap?'wrap':'scroll'} onChange={e=>onChange({wordWrap:e.target.value==='wrap'})}><option value="wrap">Word wrap</option><option value="scroll">Horizontal scroll</option></Select></Field>
      <Field label="Default response view"><Select value={value.responseView} onChange={e=>onChange({responseView:e.target.value as SaPreferences['responseView']})}><option value="tree">JSON Tree</option><option value="raw">Raw</option><option value="headers">Headers</option></Select></Field>
      <Field label="Ask your SA on entry"><Select value={value.chatDefault} onChange={e=>onChange({chatDefault:e.target.value as SaPreferences['chatDefault']})}><option value="collapsed">Collapsed</option><option value="normal">Open</option></Select></Field>
      <Field label="JSON levels opened automatically"><Select value={value.jsonDepth} onChange={e=>onChange({jsonDepth:Number(e.target.value)})}>{[0,1,2,3,4,5].map(n=><option key={n} value={n}>{n===0?'All collapsed':`${n} level${n===1?'':'s'}`}</option>)}</Select></Field>
      <Field label="Default timeout for new requests (seconds)"><Input type="number" min="1" max="120" value={value.timeoutMs/1000} onChange={e=>{const seconds=Number(e.target.value);if(Number.isFinite(seconds)&&seconds>=1&&seconds<=120)onChange({timeoutMs:Math.round(seconds*1000)})}}/></Field>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><p className="max-w-xl text-xs text-muted">Saved on this device. Drag the divider to resize; double-click to reset. Timeout applies to new requests. Reset keeps your APIs and collections.</p><Button variant="outline" icon={<RotateCcw className="size-4"/>} onClick={()=>onChange({...DEFAULT_SA_PREFERENCES})}>Reset display</Button></div>
  </section>
}
