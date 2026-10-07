import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Ban, Check, HelpCircle, Plus, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { findQuestions } from '../../lib/ai'
import { questionsApi, type OpenQuestion } from '../../lib/api'
import { useResetState } from '../../lib/useResetState'
import { Badge, Button, ErrorNote, Input, Textarea } from '../ui'

type Filter = 'open' | 'answered' | 'dropped' | 'all'
const ORIGIN: Record<OpenQuestion['origin'], string> = { manual: 'you', ai: 'AI', meeting: 'meeting' }

type RowProps = { q: OpenQuestion; selected: boolean; disabled: boolean; onSelect: () => void; onUpdate: (patch: Partial<OpenQuestion>) => void; onDelete: () => void }
function QuestionRow({ q, selected, disabled, onSelect, onUpdate, onDelete }: RowProps) {
  const [answer, setAnswer] = useState(q.answer)
  const [answering, setAnswering] = useState(false)
  return <li id={`question-${q.id}`} className={clsx('space-y-3 p-4 transition', selected && 'bg-forest-soft/40', q.status === 'dropped' && !selected && 'opacity-70')}>
    <div className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-forest" checked={selected} disabled={disabled} onChange={onSelect} aria-label={`Select question: ${q.question}`} />
      <HelpCircle className={clsx('mt-1 size-4 shrink-0', q.status === 'answered' ? 'text-ok' : q.status === 'open' ? 'text-ember' : 'text-muted')} />
      <div className="min-w-0 flex-1">
        <p className={clsx('text-sm font-medium leading-relaxed', q.status === 'dropped' && 'line-through')}>{q.question}</p>
        {q.context && <p className="mt-1 text-xs leading-relaxed text-muted">{q.context}</p>}
        {q.status === 'answered' && !answering && <p className="mt-2 rounded-lg bg-forest-soft px-3 py-2 text-sm text-forest">{q.answer || '(answered)'}</p>}
      </div>
      <span className="hidden sm:inline-flex"><Badge>{ORIGIN[q.origin]}</Badge></span>
    </div>
    {answering ? <div className="space-y-2 pl-7">
      <Textarea rows={2} autoFocus disabled={disabled} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Enter the client's answer..." />
      <div className="flex gap-2"><Button icon={<Check className="size-4" />} disabled={disabled || !answer.trim()} onClick={() => { onUpdate({ status: 'answered', answer: answer.trim() }); setAnswering(false) }}>Save answer</Button><Button variant="ghost" disabled={disabled} onClick={() => setAnswering(false)}>Cancel</Button></div>
    </div> : <div className="flex flex-wrap gap-1 pl-7">
      {q.status !== 'dropped' && <Button variant="ghost" disabled={disabled} className="px-2 py-1 text-xs" icon={<Check className="size-3.5" />} onClick={() => { setAnswer(q.answer); setAnswering(true) }}>{q.status === 'answered' ? 'Edit answer' : 'Answer'}</Button>}
      {q.status === 'open' ? <Button variant="ghost" disabled={disabled} className="px-2 py-1 text-xs" icon={<Ban className="size-3.5" />} onClick={() => onUpdate({ status: 'dropped' })}>Drop</Button> : <Button variant="ghost" disabled={disabled} className="px-2 py-1 text-xs" icon={<RotateCcw className="size-3.5" />} onClick={() => onUpdate({ status: 'open' })}>Reopen</Button>}
      <Button variant="danger" disabled={disabled} className="px-2 py-1 text-xs" aria-label="Delete question" icon={<Trash2 className="size-3.5" />} onClick={() => confirm('Delete this question?') && onDelete()} />
    </div>}
  </li>
}

/** Answers become confirmed facts; selections are limited to the current filtered view. */
export function QuestionsPanel({ projectId, hideTitle = false }: { projectId: string; hideTitle?: boolean }) {
  const qc = useQueryClient()
  const key = ['questions', projectId]
  const questions = useQuery({ queryKey: key, queryFn: () => questionsApi.list(projectId) })
  const location = useLocation()
  const hashId = location.hash.startsWith('#question-') ? location.hash.slice(10) : null
  const focusedId = hashId && questions.data?.some(question => question.id === hashId) ? hashId : null
  const [filter, setFilter] = useResetState<Filter>(focusedId, () => 'all', 'open')
  const [draft, setDraft] = useState('')
  const [finding, setFinding] = useState('')
  const [findError, setFindError] = useState<unknown>(null)
  const [found, setFound] = useState<number | null>(null)
  const [search, setSearch] = useResetState(focusedId, () => '', '')
  const [selection, setSelection] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notice, setNotice] = useState('')
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['audit', projectId] })])
  const add = useMutation({ mutationFn: () => questionsApi.create(projectId, { question: draft.trim() }), onSuccess: () => { setDraft(''); return refresh() } })
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<OpenQuestion> }) => questionsApi.update(id, patch), onSuccess: refresh })
  const remove = useMutation({ mutationFn: questionsApi.remove, onSuccess: refresh })
  const bulk = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'drop' | 'delete' }) => questionsApi.bulk(projectId, ids, action),
    onSuccess: async (data, request) => {
      setSelection([]); setConfirmDelete(false)
      setNotice(`${data.affected} question${data.affected === 1 ? '' : 's'} ${request.action === 'drop' ? 'dropped. You can reopen them from the Dropped tab.' : 'deleted.'}`)
      await refresh()
    },
  })
  async function find() {
    setFinding('Reading the documents...'); setFindError(null); setFound(null)
    try {
      const { added } = await findQuestions(projectId, { onProgress: c => setFinding(`Listing questions... ${c.toLocaleString()} characters`), onTool: setFinding })
      setFound(added); setFilter('open'); resetSelection(); await refresh()
    } catch (e) { setFindError(e) } finally { setFinding('') }
  }
  function submit(e: FormEvent) { e.preventDefault(); if (draft.trim()) add.mutate() }
  const all = questions.data ?? []
  const count = (status: Filter) => status === 'all' ? all.length : all.filter(q => q.status === status).length
  const shown = all.filter(q => (filter === 'all' || q.status === filter) && `${q.question} ${q.context} ${q.answer}`.toLowerCase().includes(search.toLowerCase()))
  useEffect(() => {
    if (!focusedId) return
    const frame = requestAnimationFrame(() => document.getElementById(`question-${focusedId}`)?.scrollIntoView({ block: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [focusedId])
  const selected = shown.filter(q => selection.includes(q.id))
  const dropIds = selected.filter(q => q.status !== 'dropped').map(q => q.id)
  const busy = bulk.isPending || update.isPending || remove.isPending
  const allSelected = shown.length > 0 && selected.length === shown.length
  function resetSelection() { setSelection([]); setConfirmDelete(false); setNotice('') }
  function changeSelection(ids: string[]) { setSelection(ids); setConfirmDelete(false); setNotice('') }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {!hideTitle ? <div><h2 className="font-display text-xl font-semibold">Open questions</h2><p className="mt-1 text-xs text-muted">What still needs the client's confirmation. Answers are used by AI as confirmed facts.</p></div> : <p className="max-w-lg text-sm text-muted">Review client decisions, answer questions, or manage several items at once.</p>}
      <Button variant="ai" icon={<Sparkles className="size-4" />} disabled={busy} loading={!!finding} onClick={() => void find()}>Find with AI</Button>
    </div>
    {finding && <p role="status" className="truncate font-mono text-xs text-ember">{finding}</p>}
    {found !== null && <p role="status" className="text-xs text-ok">{found ? `Added ${found} new question${found > 1 ? 's' : ''}.` : 'No new questions found.'}</p>}
    <ErrorNote error={findError ?? questions.error ?? add.error ?? update.error ?? remove.error ?? bulk.error} />
    {notice && <p role="status" className="rounded-lg bg-forest-soft p-3 text-sm text-ok">{notice}</p>}
    <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted" /><Input className="pl-9" aria-label="Search questions" placeholder="Search questions, context or answers..." value={search} disabled={busy} onChange={e => { setSearch(e.target.value); resetSelection() }} /></div>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Question status">
      {(['open', 'answered', 'dropped', 'all'] as const).map(status => <button key={status} role="tab" aria-selected={filter === status} disabled={busy} onClick={() => { setFilter(status); resetSelection() }} className={clsx('rounded-lg px-3 py-2 text-xs font-medium capitalize transition disabled:opacity-50', filter === status ? 'bg-forest text-paper' : 'bg-paper text-muted hover:bg-forest-soft hover:text-ink')}>{status} · {count(status)}</button>)}
    </div>
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/60 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input ref={element => { if (element) element.indeterminate = selected.length > 0 && !allSelected }} type="checkbox" className="size-4 accent-forest" disabled={busy || !shown.length} checked={allSelected} onChange={() => changeSelection(allSelected ? [] : shown.map(q => q.id))} />Select all <span className="text-xs text-muted">({shown.length} shown)</span></label>
        <span className="text-xs text-muted">{selected.length ? `${selected.length} selected` : 'Select questions for bulk actions'}</span>
      </div>
      {selected.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-line bg-forest-soft/40 px-4 py-3">
        <Button variant="outline" disabled={busy || !dropIds.length} loading={bulk.isPending && bulk.variables?.action === 'drop'} icon={<Ban className="size-4" />} onClick={() => bulk.mutate({ ids: dropIds, action: 'drop' })}>Drop selected ({dropIds.length})</Button>
        <Button variant="danger" className="border border-bad/25" disabled={busy} icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>Delete selected ({selected.length})</Button>
        <Button variant="ghost" disabled={busy} onClick={resetSelection}>Clear selection</Button>
      </div>}
      {confirmDelete && selected.length > 0 && <div role="alert" className="space-y-3 border-b border-bad/25 bg-ember-soft px-4 py-3"><p className="text-sm font-medium">Permanently delete {selected.length} selected question{selected.length === 1 ? '' : 's'}?</p><p className="text-xs text-muted">This cannot be undone. Drop questions to keep them available for reopening.</p><div className="flex flex-wrap gap-2"><Button variant="danger" className="border border-bad/30" loading={bulk.isPending} disabled={busy} onClick={() => bulk.mutate({ ids: selected.map(q => q.id), action: 'delete' })}>Confirm delete</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button></div></div>}
      <ul aria-label="Client questions" className="max-h-[640px] divide-y divide-line overflow-y-auto overscroll-contain">
        {shown.length === 0 && <li className="p-6 text-center text-sm text-muted">{questions.isPending ? 'Loading questions...' : search ? 'No questions match your search.' : filter === 'open' ? 'No open questions. All caught up.' : 'No questions in this view.'}</li>}
        {shown.map(q => <QuestionRow key={q.id} q={q} selected={selection.includes(q.id)} disabled={busy} onSelect={() => changeSelection(selection.includes(q.id) ? selection.filter(id => id !== q.id) : [...selection, q.id])} onUpdate={patch => update.mutate({ id: q.id, patch })} onDelete={() => remove.mutate(q.id)} />)}
      </ul>
    </div>
    <form onSubmit={submit} className="flex gap-2"><Input className="min-w-0 flex-1" aria-label="New client question" disabled={busy} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a question for the client..." maxLength={2000} /><Button type="submit" variant="outline" icon={<Plus className="size-4" />} loading={add.isPending} disabled={busy || !draft.trim()}>Add</Button></form>
  </section>
}
