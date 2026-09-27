import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, NotebookPen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { processMeetingNotes, type MeetingResult } from '../../lib/ai'
import { useRequestFiles } from '../../lib/useRequestFiles'
import { AttachFiles } from '../AttachFiles'
import { Button, ErrorNote, Input, Textarea } from '../ui'

/**
 * Meeting notes → requirements. Paste notes or attach a transcript / recording (markitdown converts it);
 * the AI saves a structured requirement source and sends open questions to the tracker.
 */
export function MeetingNotesPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const files = useRequestFiles()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<MeetingResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const running = !!status

  async function run() {
    setStatus('Reading the notes…')
    setError(null)
    setResult(null)
    try {
      const r = await processMeetingNotes(
        { projectId, title: title.trim() || undefined, notes, attachmentIds: files.ids },
        { onProgress: (c) => setStatus(`Extracting… ${c.toLocaleString()} chars`), onTool: setStatus },
      )
      setResult(r)
      setNotes('')
      setTitle('')
      files.clear()
      await Promise.all(['sources', 'questions', 'audit'].map((k) => qc.invalidateQueries({ queryKey: [k, projectId] })))
    } catch (e) {
      setError(e)
    } finally {
      setStatus('')
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-ember/40 bg-ember-soft/40 p-4">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <NotebookPen className="size-5 text-ember" />
        <span className="flex-1">
          <span className="block font-display text-lg font-semibold">Meeting notes → requirements</span>
          <span className="block text-xs text-muted">Paste notes or attach a transcript / recording. The AI extracts requirements, decisions, action items and questions.</span>
        </span>
        <ChevronDown className={`size-4 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title (optional), e.g. Discovery call — tim CS" disabled={running} />
          <Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste catatan meeting, transkrip, atau chat…" disabled={running} />
          <AttachFiles state={files} disabled={running} />
          <Button variant="ai" icon={<Sparkles className="size-4" />} loading={running} disabled={(!notes.trim() && !files.ids.length) || files.uploading} onClick={run}>
            Extract requirements
          </Button>
          {running && <p className="truncate font-mono text-xs text-ember">{status}</p>}
          <ErrorNote error={error ?? files.error} />
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-lg bg-panel p-3 text-sm">
          <p className="font-semibold text-ok">Saved “{result.title}” as a requirement source.</p>
          <p className="text-muted">{result.summary}</p>
          <p className="font-mono text-xs text-muted">
            {result.requirements.length} requirements · {result.decisions.length} decisions · {result.action_items.length} action items · {result.open_questions.length} questions added to the tracker
          </p>
        </div>
      )}
    </section>
  )
}
