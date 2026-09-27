import { Bot, Send, Square, Wand2 } from 'lucide-react'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { assist, type AssistMessage } from '../lib/ai'
import { useRequestFiles } from '../lib/useRequestFiles'
import { AttachFiles } from './AttachFiles'
import { Markdown } from './Markdown'
import { Button, ErrorNote, Textarea } from './ui'

interface Props {
  kind: 'skill' | 'template' | 'theme' | 'mcp'
  /** What the editor currently holds; sent so the AI edits it instead of starting over. */
  current: Record<string, unknown>
  /** Called with the AI's proposed field values; the page fills its editor and the user decides to save. */
  onProposal: (data: Record<string, unknown>) => void
  placeholder: string
  starters: string[]
  /** Shown after a proposal arrives. */
  appliedNote?: string
  intro?: string
  title?: string
  /** The saved skill / format being edited, so the AI also sees its reference files. */
  ownerId?: string
}

/** Chat with the AI to draft or refine a skill / template. The conversation lives only in this component. */
export function AssistantChat({ kind, current, onProposal, placeholder, starters, appliedNote = 'Proposal applied to the editor — review it, then Save.', intro, title = 'Design with AI', ownerId }: Props) {
  const [messages, setMessages] = useState<AssistMessage[]>([])
  const [input, setInput] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [activity, setActivity] = useState('')
  const [chars, setChars] = useState(0)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const files = useRequestFiles()
  const abort = useRef<AbortController | null>(null)
  const running = reply !== null

  async function send(text: string) {
    const content = text.trim()
    if (!content || running || files.uploading) return
    const attachmentIds = files.ids
    files.clear()
    const history: AssistMessage[] = [...messages, { role: 'user', content }]
    setMessages(history)
    setInput('')
    setReply('')
    setActivity('')
    setChars(0)
    setApplied(false)
    setError(null)
    abort.current = new AbortController()
    let answer = ''
    try {
      const proposal = await assist(
        { kind, current, messages: history, ownerId, attachmentIds },
        {
          onText: (t) => {
            answer += t
            setReply(answer)
            setActivity('')
          },
          onTool: setActivity,
          onProgress: setChars,
        },
        abort.current.signal,
      )
      if (proposal) {
        onProposal(proposal)
        setApplied(true)
      }
      const summary = answer.trim() || (proposal ? 'Draft proposed — see the editor.' : '(no response)')
      setMessages([...history, { role: 'assistant', content: summary }])
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e)
      if (answer.trim()) setMessages([...history, { role: 'assistant', content: answer.trim() }])
    } finally {
      setReply(null)
      setActivity('')
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(input)
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ember/40 bg-ember-soft/40 p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Wand2 className="size-4 text-ember" /> {title}
      </h2>

      <div className="max-h-[420px] space-y-3 overflow-y-auto text-sm">
        {messages.length === 0 && !running && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              {intro ?? 'Describe what you need. The AI can look things up in the Cekat docs, then fills the editor for you to review and save.'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {starters.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-panel px-2 py-0.5 text-left text-[11px] text-muted hover:border-ember hover:text-ember">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p key={i} className="ml-6 rounded-lg bg-forest px-3 py-2 text-paper">
              {m.content}
            </p>
          ) : (
            <div key={i} className="mr-2 border-l-2 border-line pl-3">
              <Markdown>{m.content}</Markdown>
            </div>
          ),
        )}
        {running && (
          <div className="mr-2 border-l-2 border-ember pl-3">
            {reply ? <Markdown>{reply}</Markdown> : <Bot className="size-4 animate-pulse text-ember" />}
            {activity ? (
              <p className="mt-1 truncate font-mono text-[11px] text-ember">{activity}…</p>
            ) : (
              chars > (reply?.length ?? 0) && (
                <p className="mt-1 font-mono text-[11px] text-ember">Writing the draft… {chars.toLocaleString()} chars</p>
              )
            )}
          </div>
        )}
      </div>

      {applied && <p className="rounded-md bg-forest-soft px-3 py-2 text-xs text-forest">{appliedNote}</p>}
      <ErrorNote error={error} />

      <form onSubmit={onSubmit} className="space-y-2">
        <Textarea rows={3} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} disabled={running} />
        <AttachFiles state={files} disabled={running} />
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" disabled={running || !messages.length} onClick={() => setMessages([])}>
            New chat
          </Button>
          {running ? (
            <Button type="button" variant="outline" icon={<Square className="size-3.5" />} onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" variant="ai" icon={<Send className="size-4" />} disabled={!input.trim()}>
              Send
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
