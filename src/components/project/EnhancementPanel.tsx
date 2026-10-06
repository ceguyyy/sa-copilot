import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { CheckCheck, History, RotateCcw, ScanSearch, Sparkles, X } from 'lucide-react'
import type { EnhancementBatch, EnhancementItem, EnhancementReport } from '../../../shared/enhancement.ts'
import { enhanceProject } from '../../lib/ai'
import { enhancementApi } from '../../lib/api'
import { Badge, Button, ErrorNote, Field, Input, Textarea } from '../ui'

const format = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2)
const toggle = (keys: string[], key: string) => keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key]

function Report({ report }: { report: EnhancementReport }) {
  return <div className="space-y-2 rounded-xl border border-line bg-paper/50 p-4 text-sm">
    <p>{report.summary}</p>
    {report.issues.map((i, n) => <div key={n} className="rounded-lg bg-ember-soft p-3"><p className="text-warn">{i.detail}</p><p className="mt-1">{i.suggestion}</p></div>)}
  </div>
}

export function EnhancementPanel({ projectId, initialOpen = false, initialHistory = false }: { projectId: string; initialOpen?: boolean; initialHistory?: boolean }) {
  const qc = useQueryClient()
  const dialog = useRef<HTMLDialogElement>(null)
  const pause = useRef(false)
  const [open, setOpen] = useState(initialOpen)
  const [prompt, setPrompt] = useState('')
  const [rules, setRules] = useState('Keep confirmed prices, quantities and dates unchanged unless explicitly requested. Preserve the existing format and language.')
  const [targets, setTargets] = useState<string[]>([])
  const [context, setContext] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [batch, setBatch] = useState<EnhancementBatch | null>(null)
  const [accepted, setAccepted] = useState<string[]>([])
  const [resolutions, setResolutions] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [pauseRequested, setPauseRequested] = useState(false)
  const [activity, setActivity] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [showHistory, setShowHistory] = useState(initialHistory)
  const inventory = useQuery({ queryKey: ['enhancement-items', projectId], queryFn: () => enhancementApi.items(projectId), enabled: open })
  const history = useQuery({ queryKey: ['enhancement-history', projectId], queryFn: () => enhancementApi.history(projectId), enabled: open })

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current?.close()
  }, [open])

  const refresh = async () => {
    await Promise.all(['enhancement-items', 'enhancement-history', 'documents', 'sources', 'demo', 'audit', 'consistency', 'files', 'project'].map(key => qc.invalidateQueries({ queryKey: [key, projectId] })))
    await qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(null); pause.current = false; setPauseRequested(false)
    try { await task() } catch (e) { setError(e) } finally { setBusy(false); setActivity(''); void history.refetch() }
  }
  function selectBatch(b: EnhancementBatch) {
    setBatch(b); setResolutions(b.resolutions); setAccepted(b.state === 'draft' ? b.review_keys.length ? b.review_keys : b.items.filter(i => i.state === 'ready').map(i => i.key) : b.accepted)
    setShowHistory(false); setError(null)
  }
  async function analyze() {
    await run(async () => {
      setActivity('Saving revision plan...')
      const draft = await enhancementApi.create(projectId, { prompt, rules, targets, context })
      selectBatch(draft)
      setActivity('Checking conflicts and affected items...')
      const result = await enhanceProject({ batchId: draft.id, action: 'analyze' }, { onProgress: chars => setActivity(`Analyzing revision plan · ${chars.toLocaleString()} characters`) })
      selectBatch(result)
    })
  }
  async function previews(keys: string[]) {
    if (!batch) return
    setGenerating(true)
    await run(async () => {
      let current = batch
      if (current.report?.conflicts.length && !current.items.some(i => i.state === 'ready')) current = await enhancementApi.resolutions(current.id, resolutions)
      for (const [index, key] of keys.entries()) {
        if (pause.current) break
        const label = current.items.find(i => i.key === key)?.title ?? key
        const prefix = `${index + 1}/${keys.length} · ${label}`
        setActivity(`Revising ${prefix}`)
        current = await enhanceProject({ batchId: current.id, action: 'preview', key }, { onProgress: chars => setActivity(`${prefix} · ${chars.toLocaleString()} characters`) })
        setBatch(current)
        if (current.items.find(i => i.key === key)?.state === 'ready') setAccepted(previous => previous.includes(key) ? previous : [...previous, key])
        else setAccepted(previous => previous.filter(k => k !== key))
      }
    })
    setGenerating(false)
  }
  function newPlan(extra?: string) {
    if (batch) {
      setPrompt(batch.prompt); setRules(batch.rules); setTargets([...new Set([...batch.items.map(i => i.key), ...(extra ? [extra] : [])])]); setContext(batch.context.map(i => i.key))
    }
    setBatch(null); setAccepted([]); setResolutions({}); setError(null)
  }
  const items = inventory.data ?? []
  const visible = items.filter(i => `${i.title} ${i.category}`.toLowerCase().includes(search.toLowerCase()))
  const editable = items.filter(i => i.editable)
  const categories = [...new Set(visible.map(i => i.category))]
  const unresolved = batch?.report?.conflicts.some(c => !resolutions[c.id]?.trim())
  const reviewMatches = batch?.review && [...batch.review_keys].sort().join('|') === [...accepted].sort().join('|')
  const readyCount = batch?.items.filter(i => i.state === 'ready').length ?? 0
  const draft = batch?.state === 'draft'

  return <>
    <Button variant="ai" icon={<Sparkles className="size-4" />} onClick={() => setOpen(true)}>Project Knowledge AI Enhancement</Button>
    <dialog ref={dialog} aria-labelledby="enhancement-title" onCancel={e => { if (busy) e.preventDefault(); else setOpen(false) }} onClose={() => setOpen(false)} className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-line bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/50">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-panel p-5">
        <div><h2 id="enhancement-title" className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 text-ember" /> Project Knowledge AI Enhancement</h2><p className="mt-1 text-sm text-muted">Revise selected items together while keeping your project consistent.</p></div>
        <Button variant="ghost" aria-label="Close enhancement" disabled={busy} onClick={() => setOpen(false)}><X className="size-5" /></Button>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { setBatch(null); setShowHistory(false); setError(null) }}>New revision plan</Button><Button variant="outline" disabled={busy} icon={<History className="size-4" />} onClick={() => setShowHistory(v => !v)}>Revision history ({history.data?.length ?? 0})</Button></div>
        <ErrorNote error={error ?? inventory.error ?? history.error} />
        {showHistory && <section className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-line p-4"><h3 className="font-semibold">Saved revision batches</h3>{history.isPending ? <p className="text-sm text-muted">Loading history...</p> : !history.data?.length ? <p className="text-sm text-muted">No revision batches yet.</p> : history.data.map(b => <button key={b.id} disabled={busy} onClick={() => selectBatch(b)} className="block w-full rounded-lg border border-line p-3 text-left hover:bg-forest-soft"><div className="flex items-center gap-2"><Badge tone={b.state === 'applied' ? 'ok' : 'neutral'}>{b.state}</Badge><span className="text-xs text-muted">{new Date(b.created_at).toLocaleString()}</span></div><p className="mt-1 line-clamp-2 text-sm font-medium">{b.prompt}</p><p className="mt-1 text-xs text-muted">{b.items.length} targets · {b.items.filter(i => i.state === 'ready').length} previews · {b.accepted.length} applied</p></button>)}</section>}
        {!batch ? <>
          <div className="rounded-xl bg-forest-soft p-4 text-sm"><strong>Context is read-only.</strong> Revision targets are the items AI may change. Uploaded source files serve as references; editable requirements and knowledge text can be revised. POC is excluded. Generated exports are updated when their documents are saved. Demo changes remain local until you push them from the Demo tab.</div>
          <div className="flex flex-wrap items-center justify-between gap-3"><Input aria-label="Search revision items" placeholder="Search items or categories..." className="sm:max-w-xs" value={search} onChange={e => setSearch(e.target.value)} /><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !items.length} onClick={() => setContext(context.length === items.length ? [] : items.map(i => i.key))}>{context.length === items.length && items.length ? 'Clear context' : 'Use all as context'}</Button><Button variant="outline" disabled={busy || !editable.length} onClick={() => setTargets(targets.length === editable.length ? [] : editable.map(i => i.key))}>{targets.length === editable.length && editable.length ? 'Clear targets' : 'Select all targets'}</Button></div></div>
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 bg-paper px-4 py-3 text-xs font-semibold sm:grid-cols-[minmax(0,1fr)_90px_90px]"><span>Project items</span><span className="text-center">Context</span><span className="text-center">Revise</span></div>
            <div className="max-h-80 overflow-y-auto">{inventory.isPending ? <p className="p-4 text-sm text-muted">Loading project items...</p> : !visible.length ? <p className="p-4 text-sm text-muted">No matching items.</p> : categories.map(category => <section key={category}><div className="flex items-center justify-between gap-2 border-t border-line bg-paper/50 px-4 py-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{category}</h3><button disabled={busy} className="text-xs text-forest underline" onClick={() => { const group = items.filter(i => i.category === category && i.editable).map(i => i.key); setTargets(previous => group.every(k => previous.includes(k)) ? previous.filter(k => !group.includes(k)) : [...new Set([...previous, ...group])]) }}>Toggle category targets</button></div>{visible.filter(i => i.category === category).map(i => <ItemSelection key={i.key} item={i} context={context.includes(i.key)} target={targets.includes(i.key)} disabled={busy} onContext={() => setContext(v => toggle(v, i.key))} onTarget={() => setTargets(v => toggle(v, i.key))} />)}</section>)}</div>
          </div>
          <p className="text-xs text-muted">{context.length} context items · {targets.length} revision targets</p>
          <Field label="Revision prompt"><Textarea rows={4} maxLength={8000} disabled={busy} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="For example: Add CSAT and NPS after each conversation. Align the SOW and TOR scope and acceptance criteria." /></Field>
          <Field label="Preserve rules" hint="Describe what must stay unchanged: pricing, dates, sections, wording or format."><Textarea rows={2} maxLength={8000} disabled={busy} value={rules} onChange={e => setRules(e.target.value)} /></Field>
          <Button icon={<ScanSearch className="size-4" />} disabled={busy || !targets.length || !prompt.trim()} onClick={() => { void analyze() }}>Analyze revision plan</Button>
        </> : <>
          <div className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-center gap-2"><Badge tone={batch.state === 'applied' ? 'ok' : 'neutral'}>{batch.state}</Badge><span className="text-xs text-muted">{batch.items.length} targets · {batch.context.length} reference items</span></div><p className="mt-2 whitespace-pre-wrap text-sm font-medium">{batch.prompt}</p><details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Preserve rules & context</summary><p className="mt-2 whitespace-pre-wrap">{batch.rules || 'No additional rules.'}</p><ul className="mt-2 list-inside list-disc">{batch.context.map(i => <li key={i.key}>{i.title}</li>)}</ul></details></div>
          {!batch.report && draft && <Button disabled={busy} onClick={() => { void run(async () => { setActivity('Analyzing revision plan...'); selectBatch(await enhanceProject({ batchId: batch.id, action: 'analyze' })) }) }}>Retry analysis</Button>}
          {batch.report && <><h3 className="font-semibold">Revision plan & consistency findings</h3><Report report={batch.report} />
            {!!batch.report.impacts.length && <section className="space-y-2 rounded-xl border border-forest/25 p-4"><h4 className="text-sm font-semibold">Impact suggestions</h4>{batch.report.impacts.map(i => <div key={i.key} className="flex flex-wrap items-start justify-between gap-2 text-sm"><div><p className="font-medium">{items.find(x => x.key === i.key)?.title ?? i.key}</p><p className="text-muted">{i.reason}</p></div>{draft && <Button variant="outline" disabled={busy} onClick={() => newPlan(i.key)}>Add to new plan</Button>}</div>)}<p className="text-xs text-muted">Adding targets creates a new plan for analysis. The current draft stays in history.</p></section>}
            {!!batch.report.conflicts.length && <section className="space-y-4 rounded-xl border border-warn/30 bg-ember-soft/40 p-4"><h4 className="font-semibold">Clarify conflicts before revising</h4>{batch.report.conflicts.map(c => <div key={c.id} className="space-y-2"><p className="text-sm text-warn">{c.detail}</p><Field label={c.question}><Textarea rows={2} maxLength={4000} value={resolutions[c.id] ?? ''} disabled={busy || !draft || readyCount > 0} onChange={e => setResolutions(v => ({ ...v, [c.id]: e.target.value }))} placeholder="Specify which value or rule the AI should follow." /></Field></div>)}{readyCount > 0 && <p className="text-xs text-muted">Decisions are locked after previews are generated. Start a new plan to change them.</p>}</section>}
          </>}
          {draft && batch.report && <div className="flex flex-wrap gap-2"><Button icon={<Sparkles className="size-4" />} disabled={busy || unresolved || batch.items.every(i => i.state === 'ready')} onClick={() => { void previews(batch.items.filter(i => i.state !== 'ready').map(i => i.key)) }}>Generate remaining previews</Button>{batch.items.some(i => i.state === 'failed') && <Button variant="outline" disabled={busy || unresolved} onClick={() => { void previews(batch.items.filter(i => i.state === 'failed').map(i => i.key)) }}>Retry failed items</Button>}<Button variant="ghost" disabled={busy} onClick={() => newPlan()}>Edit as new plan</Button></div>}
          <div className="space-y-3">{batch.items.map(i => <section key={i.key} className="overflow-hidden rounded-xl border border-line"><div className="flex flex-wrap items-center justify-between gap-3 bg-paper/50 p-4"><div className="flex min-w-0 items-center gap-3">{draft && i.state === 'ready' && <input type="checkbox" className="size-4 accent-forest" aria-label={`Accept ${i.title}`} disabled={busy} checked={accepted.includes(i.key)} onChange={() => setAccepted(v => toggle(v, i.key))} />}<div><p className="break-words text-sm font-semibold">{i.title}</p><p className="text-xs text-muted">{i.category}</p></div></div><div className="flex items-center gap-2"><Badge tone={i.state === 'ready' ? 'ok' : i.state === 'failed' ? 'warn' : 'neutral'}>{i.state}</Badge>{draft && i.state === 'failed' && <Button variant="outline" disabled={busy || unresolved} onClick={() => { void previews([i.key]) }}>Retry</Button>}</div></div>{i.error && <div className="p-4"><ErrorNote error={i.error} /></div>}{i.state === 'ready' && <div className="space-y-3 p-4"><p className="text-sm">{i.summary}</p><details><summary className="cursor-pointer text-sm font-medium text-forest">Compare before & after</summary><div className="mt-3 grid gap-3 md:grid-cols-2">{[{ label: 'Before', value: i.content }, { label: 'Proposed revision', value: i.proposed }].map(v => <div key={v.label} className="min-w-0"><p className="mb-2 text-xs font-semibold uppercase text-muted">{v.label}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-paper p-3 text-xs">{format(v.value)}</pre></div>)}</div></details></div>}</section>)}</div>
          {draft && readyCount > 0 && <section className="space-y-4 border-t border-line pt-5"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setAccepted(accepted.length === readyCount ? [] : batch.items.filter(i => i.state === 'ready').map(i => i.key))}>{accepted.length === readyCount ? 'Clear accepted previews' : 'Accept all ready previews'}</Button><Button variant="outline" icon={<ScanSearch className="size-4" />} disabled={busy || !accepted.length} onClick={() => { void run(async () => { setActivity('Checking selected previews and preserve rules...'); setBatch(await enhanceProject({ batchId: batch.id, action: 'review', accepted }, { onProgress: chars => setActivity(`Checking consistency · ${chars.toLocaleString()} characters`) })); await refresh() }) }}>Check selected previews</Button></div>{batch.review && <><h3 className="font-semibold">Preview consistency check</h3><Report report={batch.review} />{batch.review.conflicts.map(c => <p key={c.id} className="rounded-lg bg-ember-soft p-3 text-sm text-warn">{c.detail} {c.question}</p>)}{!reviewMatches && <p className="text-sm text-warn">Selection changed. Check the selected previews again.</p>}</>}<p className="text-sm text-muted">Apply {accepted.length} selected revisions together. Original versions are kept for undo.</p><Button icon={<CheckCheck className="size-4" />} disabled={busy || !accepted.length || !reviewMatches || !!batch.review?.conflicts.length} onClick={() => { void run(async () => { setActivity('Applying selected revisions...'); setBatch(await enhancementApi.apply(batch.id, accepted)); await refresh() }) }}>Apply selected revisions</Button></section>}
          {batch.state === 'applied' && <div className="space-y-3 rounded-xl bg-forest-soft p-4"><p className="text-sm font-medium">Applied {batch.accepted.length} revisions. Undo restores the previous contents together and preserves the version history.</p><p className="text-xs text-muted">Undo is blocked if any applied item has been edited since this batch. Demo changes here do not update an already published demo.</p><Button variant="outline" icon={<RotateCcw className="size-4" />} disabled={busy} onClick={() => { void run(async () => { setActivity('Restoring previous versions...'); setBatch(await enhancementApi.undo(batch.id)); await refresh() }) }}>Undo this batch</Button></div>}
          {batch.state === 'undone' && <p role="status" className="rounded-lg bg-forest-soft p-4 text-sm text-ok">This batch was undone. Previous contents were restored.</p>}
        </>}
        {busy && <div role="status" aria-live="polite" className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ember/30 bg-panel p-4 shadow-lg"><p className="text-sm text-ember">{activity || 'Working...'}{batch && ` · ${readyCount}/${batch.items.length} previews ready`}</p>{generating && <Button variant="outline" disabled={pauseRequested} onClick={() => { pause.current = true; setPauseRequested(true) }}>{pauseRequested ? 'Pausing after current item...' : 'Pause after current item'}</Button>}</div>}
      </div>
    </dialog>
  </>
}

function ItemSelection({ item, context, target, disabled, onContext, onTarget }: { item: EnhancementItem; context: boolean; target: boolean; disabled: boolean; onContext: () => void; onTarget: () => void }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 border-t border-line px-4 py-3 sm:grid-cols-[minmax(0,1fr)_90px_90px]"><div className="min-w-0"><p className="break-words text-sm">{item.title}</p>{!item.editable && <p className="text-xs text-muted">Reference only</p>}</div><input type="checkbox" className="mx-auto size-4 accent-forest" checked={context} disabled={disabled} aria-label={`Use ${item.title} as context`} onChange={onContext} /><input type="checkbox" className="mx-auto size-4 accent-ember" checked={target} disabled={disabled || !item.editable} aria-label={`Revise ${item.title}`} onChange={onTarget} /></div>
}
