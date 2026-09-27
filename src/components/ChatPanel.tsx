import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eraser, Send, Square } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { chat } from '../lib/ai'
import { messagesApi, skillsApi } from '../lib/api'
import { Markdown } from './Markdown'
import { Button, ErrorNote, Select, Textarea } from './ui'

const STARTERS = [
  'Ringkas kebutuhan client dan gap terbesar yang harus dikonfirmasi.',
  'Apa risiko teknis integrasi API di project ini?',
  'Buatkan sequence diagram alur eskalasi ke human agent.',
]

export function ChatPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const key = ['messages', projectId]
  const messages = useQuery({ queryKey: key, queryFn: () => messagesApi.list(projectId) })
  const skills = useQuery({ queryKey: ['skills'], queryFn: skillsApi.list })
  const chatSkills = skills.data?.filter((s) => s.output_type === 'chat') ?? []

  const [input, setInput] = useState('')
  const [skillId, setSkillId] = useState('')
  const [pending, setPending] = useState<{ user: string; reply: string; activity: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  // Block body on purpose: newer Chromium returns a Promise from scrollIntoView, which must not leak out as an effect cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.data, pending?.reply])

  async function send(text: string) {
    const message = text.trim()
    if (!message || pending) return
    setInput('')
    setError(null)
    setPending({ user: message, reply: '', activity: '' })
    abort.current = new AbortController()
    try {
      await chat(
        { projectId, message, skillId: skillId || undefined },
        (t) => setPending((p) => (p ? { ...p, reply: p.reply + t, activity: '' } : p)),
        abort.current.signal,
        (activity) => setPending((p) => (p ? { ...p, activity } : p)),
      )
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e)
    } finally {
      setPending(null)
      qc.invalidateQueries({ queryKey: key })
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  async function clear() {
    if (!confirm('Clear the whole conversation for this project?')) return
    await messagesApi.clear(projectId).catch(setError)
    qc.invalidateQueries({ queryKey: key })
  }

  const history = messages.data ?? []

  return (
    <aside className="flex h-[calc(100vh-4rem)] flex-col rounded-xl border border-line bg-panel lg:sticky lg:top-6">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ember">Copilot</p>
          <h2 className="font-display text-lg font-semibold leading-none">Ask your SA</h2>
        </div>
        <div className="flex items-center gap-1">
          {chatSkills.length > 1 && (
            <Select aria-label="Chat skill" value={skillId} onChange={(e) => setSkillId(e.target.value)} className="w-36 py-1 text-xs">
              <option value="">Default persona</option>
              {chatSkills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <button aria-label="Clear chat" onClick={clear} className="rounded p-1.5 text-muted hover:bg-ember-soft hover:text-bad">
            <Eraser className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {history.length === 0 && !pending && (
          <div className="space-y-2">
            <p className="text-sm text-muted">The copilot reads every requirement, knowledge source and document in this project.</p>
            {STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)} className="block w-full rounded-md border border-dashed border-line px-3 py-2 text-left text-sm hover:border-ember hover:text-ember">
                {s}
              </button>
            ))}
          </div>
        )}
        {history.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.content} />
        ))}
        {pending && (
          <>
            <Bubble role="user" text={pending.user} />
            <Bubble role="assistant" text={pending.reply || '…'} streaming />
            {pending.activity && (
              <p className="truncate pl-3 font-mono text-[11px] text-ember" aria-live="polite" title={pending.activity}>
                {pending.activity}…
              </p>
            )}
          </>
        )}
        <ErrorNote error={error} />
        <div ref={bottom} />
      </div>

      <form onSubmit={onSubmit} className="border-t border-line p-3">
        <Textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Tanya, minta revisi, atau diskusi solusi… (Enter to send)"
          aria-label="Message"
        />
        <div className="mt-2 flex justify-end">
          {pending ? (
            <Button type="button" variant="outline" icon={<Square className="size-3.5" />} onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" variant="ai" disabled={!input.trim()} icon={<Send className="size-4" />}>
              Send
            </Button>
          )}
        </div>
      </form>
    </aside>
  )
}

function Bubble({ role, text, streaming }: { role: 'user' | 'assistant'; text: string; streaming?: boolean }) {
  if (role === 'user') {
    return <div className="ml-8 rounded-lg rounded-br-sm bg-forest px-3 py-2 text-sm whitespace-pre-wrap text-paper">{text}</div>
  }
  return (
    <div className={`mr-2 border-l-2 pl-3 ${streaming ? 'border-ember' : 'border-line'}`}>
      <Markdown>{text}</Markdown>
    </div>
  )
}
