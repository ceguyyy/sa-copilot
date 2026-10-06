import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { importConnectionEnv, type ConnectionEnvImport as ImportResult } from '../../shared/connectionEnv.ts'
import type { ConfigPatch } from '../lib/desktop'
import { Button, ErrorNote, Field, Textarea } from './ui'

export function ConnectionEnvImport({onApply,disabled}:{onApply:(patch:ConfigPatch)=>void;disabled:boolean}) {
  const fileInput=useRef<HTMLInputElement>(null)
  const [text,setText]=useState('')
  const [preview,setPreview]=useState<ImportResult|null>(null)
  const [error,setError]=useState<unknown>(null)
  const [message,setMessage]=useState('')
  const [reading,setReading]=useState(false)
  function prepare(value:string) {
    setPreview(null);setError(null);setMessage('')
    try { setPreview(importConnectionEnv(value)) } catch(e) { setError(e) }
    setText('')
  }
  async function readFile(file:File) {
    setReading(true)
    try {
      if (file.size>1024*1024) throw new Error('ENV files must be smaller than 1 MB.')
      prepare(await file.text())
    } catch(e) { setPreview(null);setError(e);setMessage('') }
    finally {setReading(false)}
  }
  return <fieldset className="space-y-3 rounded-lg border border-line bg-panel p-4">
    <legend className="px-1 font-display text-base font-semibold">Import from ENV</legend>
    <p className="text-xs text-muted">Choose a .env file or paste its contents. Preview lists setting names; credentials stay masked. Apply to the form, review, then Save.</p>
    <p className="text-xs text-muted">Missing settings and empty credentials keep their current values. Empty non-secret values reset to defaults. Database, port, and internal data folders are managed by the desktop app and are skipped.</p>
    <input ref={fileInput} type="file" className="hidden" accept=".env,.txt,text/plain" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void readFile(file)}} />
    <Button variant="outline" icon={<Upload className="size-4" />} disabled={disabled} loading={reading} onClick={()=>fileInput.current?.click()}>Choose ENV file</Button>
    <Field label="Or paste ENV contents"><Textarea rows={4} autoComplete="off" spellCheck={false} disabled={disabled || reading} value={text} onChange={e=>{setText(e.target.value);setPreview(null);setMessage('');setError(null)}} placeholder="9ROUTER_API_KEY=..." /></Field>
    <Button variant="outline" disabled={!text.trim() || disabled || reading} onClick={()=>prepare(text)}>Preview import</Button>
    <ErrorNote error={error} />
    {preview && <div className="space-y-2 text-sm" aria-live="polite">
      <p>{preview.imported.length} setting(s) ready: {preview.imported.join(', ') || 'none'}.</p>
      {!!preview.ignored.length && <p className="text-xs text-muted">Skipped: {preview.ignored.join(', ')}.</p>}
      {!!preview.emptySecrets.length && <p className="text-xs text-muted">Empty credentials kept unchanged: {preview.emptySecrets.join(', ')}.</p>}
      <div className="flex gap-2"><Button disabled={disabled || !preview.imported.length} onClick={()=>{onApply(preview.patch);setMessage(`${preview.imported.length} setting(s) applied to the form. Click Save to persist them.`);setPreview(null)}}>Apply to form</Button><Button variant="ghost" onClick={()=>setPreview(null)}>Discard</Button></div>
    </div>}
    {message && <p role="status" className="text-sm text-ok">{message}</p>}
  </fieldset>
}
