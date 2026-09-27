import { useQuery } from '@tanstack/react-query'
import { Bot, FileClock, Square, Wand2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { summarizeAudit } from '../../lib/ai'
import { auditApi, type AuditEvent } from '../../lib/api'
import { Markdown } from '../Markdown'
import { Badge, Button, ErrorNote, Input, Select, Spinner } from '../ui'

const PERIODS = [
  { value: '', label: 'All time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]

const TONE: Record<string, 'forest' | 'ember' | 'warn' | 'ok' | 'neutral'> = {
  document: 'forest',
  source: 'ok',
  project: 'ember',
  chat: 'neutral',
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/** Groups events by calendar day, newest first (events already arrive newest first). */
function byDay(events: AuditEvent[]): [string, AuditEvent[]][] {
  const groups = new Map<string, AuditEvent[]>()
  for (const e of events) {
    const day = dayLabel(e.at)
    groups.set(day, [...(groups.get(day) ?? []), e])
  }
  return [...groups]
}

/** Everything that happened in the project, with an AI summary or Q&A over the log. */
export function AuditPanel({ projectId }: { projectId: string }) {
  const events = useQuery({ queryKey: ['audit', projectId], queryFn: () => auditApi.list(projectId) })
  const [period, setPeriod] = useState('7')
  const [question, setQuestion] = useState('')
  const [summary, setSummary] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)

  async function summarize() {
    setRunning(true)
    setSummary('')
    setError(null)
    abort.current = new AbortController()
    try {
      await summarizeAudit({ projectId, days: period ? Number(period) : undefined, question: question.trim() || undefined }, (t) => setSummary((s) => s + t), abort.current.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-ember/40 bg-ember-soft/40 p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Wand2 className="size-4 text-ember" /> AI summary
        </h3>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40">
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <Input className="min-w-56 flex-1" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Optional question, e.g. siapa yang terakhir ubah SOW?" />
          {running ? (
            <Button variant="outline" icon={<Square className="size-3.5" />} onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button variant="ai" icon={<Bot className="size-4" />} onClick={summarize}>
              {question.trim() ? 'Ask' : 'Summarize'}
            </Button>
          )}
        </div>
        <ErrorNote error={error} />
        {(summary || running) && (
          <div className="rounded-lg bg-panel p-4">{summary ? <Markdown>{summary}</Markdown> : <Bot className="size-4 animate-pulse text-ember" />}</div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <FileClock className="size-4 text-forest" /> Activity
        </h3>
        {events.isLoading && <Spinner />}
        <ErrorNote error={events.error} />
        {events.data?.length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
        {byDay(events.data ?? []).map(([day, items]) => (
          <div key={day} className="space-y-1">
            <p className="font-mono text-[11px] tracking-wider text-muted uppercase">{day}</p>
            <ol className="divide-y divide-line rounded-lg border border-line bg-panel">
              {items.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <span className="w-12 shrink-0 font-mono text-[11px] text-muted">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="min-w-0 flex-1">{e.summary}</span>
                  <Badge tone={TONE[e.action.split('.')[0]] ?? 'neutral'}>{e.action.split('.')[0]}</Badge>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
    </div>
  )
}
