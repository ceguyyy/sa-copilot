import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Ban, Check, HelpCircle, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { findQuestions } from '../../lib/ai'
import { questionsApi, type OpenQuestion } from '../../lib/api'
import { Badge, Button, ErrorNote, Input, Textarea } from '../ui'

type Filter = 'open' | 'answered' | 'dropped' | 'all'

const ORIGIN: Record<OpenQuestion['origin'], string> = { manual: 'you', ai: 'AI', meeting: 'meeting' }

function QuestionRow({ q, onUpdate, onDelete }: { q: OpenQuestion; onUpdate: (patch: Partial<OpenQuestion>) => void; onDelete: () => void }) {
  const [answer, setAnswer] = useState(q.answer)
  const [answering, setAnswering] = useState(false)

  return (
    <li className={clsx('space-y-2 p-3', q.status === 'dropped' && 'opacity-55')}>
      <div className="flex items-start gap-2">
        <HelpCircle className={clsx('mt-0.5 size-4 shrink-0', q.status === 'answered' ? 'text-ok' : q.status === 'open' ? 'text-ember' : 'text-muted')} />
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm', q.status === 'dropped' && 'line-through')}>{q.question}</p>
          {q.context && <p className="text-xs text-muted">{q.context}</p>}
          {q.status === 'answered' && !answering && <p className="mt-1 rounded bg-forest-soft px-2 py-1 text-sm text-forest">{q.answer || '(answered)'}</p>}
        </div>
        <Badge>{ORIGIN[q.origin]}</Badge>
      </div>

      {answering ? (
        <div className="space-y-2 pl-6">
          <Textarea rows={2} autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Jawaban klien…" />
          <div className="flex gap-2">
            <Button
              icon={<Check className="size-4" />}
              disabled={!answer.trim()}
              onClick={() => {
                onUpdate({ status: 'answered', answer: answer.trim() })
                setAnswering(false)
              }}
            >
              Save answer
            </Button>
            <Button variant="ghost" onClick={() => setAnswering(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1 pl-6">
          {q.status !== 'dropped' && (
            <Button variant="ghost" className="px-2 py-1 text-xs" icon={<Check className="size-3.5" />} onClick={() => setAnswering(true)}>
              {q.status === 'answered' ? 'Edit answer' : 'Answer'}
            </Button>
          )}
          {q.status === 'open' ? (
            <Button variant="ghost" className="px-2 py-1 text-xs" icon={<Ban className="size-3.5" />} onClick={() => onUpdate({ status: 'dropped' })}>
              Drop
            </Button>
          ) : (
            <Button variant="ghost" className="px-2 py-1 text-xs" icon={<RotateCcw className="size-3.5" />} onClick={() => onUpdate({ status: 'open' })}>
              Reopen
            </Button>
          )}
          <Button variant="danger" className="px-2 py-1 text-xs" aria-label="Delete question" icon={<Trash2 className="size-3.5" />} onClick={() => confirm('Delete this question?') && onDelete()} />
        </div>
      )}
    </li>
  )
}

/** Questions to ask the client. Answers become confirmed facts in the AI's context. */
export function QuestionsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const key = ['questions', projectId]
  const questions = useQuery({ queryKey: key, queryFn: () => questionsApi.list(projectId) })
  const [filter, setFilter] = useState<Filter>('open')
  const [draft, setDraft] = useState('')
  const [finding, setFinding] = useState('')
  const [findError, setFindError] = useState<unknown>(null)
  const [found, setFound] = useState<number | null>(null)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['audit', projectId] })])

  const add = useMutation({
    mutationFn: () => questionsApi.create(projectId, { question: draft.trim() }),
    onSuccess: () => {
      setDraft('')
      return refresh()
    },
  })
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<OpenQuestion> }) => questionsApi.update(id, patch), onSuccess: refresh })
  const remove = useMutation({ mutationFn: questionsApi.remove, onSuccess: refresh })

  async function find() {
    setFinding('Reading the documents…')
    setFindError(null)
    setFound(null)
    try {
      const { added } = await findQuestions(projectId, { onProgress: (c) => setFinding(`Listing questions… ${c.toLocaleString()} chars`), onTool: setFinding })
      setFound(added)
      setFilter('open')
      await refresh()
    } catch (e) {
      setFindError(e)
    } finally {
      setFinding('')
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (draft.trim()) add.mutate()
  }

  const all = questions.data ?? []
  const count = (s: Filter) => (s === 'all' ? all.length : all.filter((q) => q.status === s).length)
  const shown = filter === 'all' ? all : all.filter((q) => q.status === filter)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Open questions</h2>
          <p className="text-xs text-muted">What still needs the client's confirmation. Answers are used by the AI as confirmed facts.</p>
        </div>
        <Button variant="ai" icon={<Sparkles className="size-4" />} loading={!!finding} onClick={find}>
          Find with AI
        </Button>
      </div>
      {finding && <p className="truncate font-mono text-xs text-ember">{finding}</p>}
      {found !== null && <p className="text-xs text-ok">{found ? `Added ${found} new question${found > 1 ? 's' : ''}.` : 'No new questions found.'}</p>}
      <ErrorNote error={findError ?? questions.error ?? add.error ?? update.error ?? remove.error} />

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Question status">
        {(['open', 'answered', 'dropped', 'all'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={filter === s}
            onClick={() => setFilter(s)}
            className={clsx('rounded-full px-3 py-1 text-xs capitalize transition', filter === s ? 'bg-forest text-paper' : 'bg-panel text-muted hover:text-ink')}
          >
            {s} · {count(s)}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
        {shown.length === 0 && <li className="p-4 text-sm text-muted">{filter === 'open' ? 'No open questions.' : 'Nothing here.'}</li>}
        {shown.map((q) => (
          <QuestionRow key={q.id} q={q} onUpdate={(patch) => update.mutate({ id: q.id, patch })} onDelete={() => remove.mutate(q.id)} />
        ))}
      </ul>

      <form onSubmit={submit} className="flex gap-2">
        <Input className="flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a question for the client…" maxLength={2000} />
        <Button type="submit" variant="outline" icon={<Plus className="size-4" />} loading={add.isPending} disabled={!draft.trim()}>
          Add
        </Button>
      </form>
    </section>
  )
}
