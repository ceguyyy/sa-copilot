import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Brain, BrainCircuit, FileText, Globe, Image as ImageIcon, NotebookPen, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { sourcesApi } from '../lib/api'
import { ACCEPTED_FILES, extractText } from '../lib/extract'
import type { Source } from '../lib/types'
import { Badge, Button, ErrorNote, Input, Textarea } from './ui'

interface Props {
  projectId: string | null
  kinds: Source['kind'][]
  title: string
  hideTitle?: boolean
  initialUpload?: boolean
}

/** Upload files / paste notes as requirement or knowledge sources. Text is extracted in the browser. */
export function SourcesPanel({ projectId, kinds, title, hideTitle = false, initialUpload = false }: Props) {
  const location = useLocation()
  const qc = useQueryClient()
  const key = ['sources', projectId ?? 'global']
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploadPrompt, setUploadPrompt] = useState(initialUpload)
  const [kind, setKind] = useState<Source['kind']>(kinds[0])
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState({ name: '', text: '' })
  const [websiteOpen, setWebsiteOpen] = useState(false)
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [progress, setProgress] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const sources = useQuery({ queryKey: key, queryFn: () => sourcesApi.list(projectId) })

  useEffect(() => {
    const id = location.hash.startsWith('#source-') ? location.hash.slice(8) : null
    if (!id || !sources.data?.some(source => source.id === id)) return
    setExpanded(id)
    const frame = requestAnimationFrame(() => document.getElementById(`source-${id}`)?.scrollIntoView({ block: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [location.hash, sources.data])
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const [i, file] of files.entries()) {
        setProgress(`Reading ${file.name} (${i + 1}/${files.length})…`)
        const extractedText = await extractText(file)
        setProgress(`Uploading ${file.name}…`)
        await sourcesApi.upload({ projectId, kind, file, extractedText })
      }
    },
    onSettled: () => {
      setProgress('')
      qc.invalidateQueries({ queryKey: key })
    },
  })

  const addNote = useMutation({
    mutationFn: () => sourcesApi.addText({ projectId, kind, name: note.name.trim() || 'Meeting notes', text: note.text }),
    onSuccess: () => {
      setNote({ name: '', text: '' })
      setNoteOpen(false)
      qc.invalidateQueries({ queryKey: key })
    },
  })

  const scrape = useMutation({
    mutationFn: () => sourcesApi.scrape({ projectId, url: websiteUrl.trim() }),
    onSuccess: () => {
      setWebsiteUrl('')
      setWebsiteOpen(false)
      qc.invalidateQueries({ queryKey: key })
    },
  })

  const toggle = useMutation({
    mutationFn: (s: Source) => sourcesApi.setEnabled(s.id, !s.enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: sourcesApi.remove,
    onSuccess: () => qc.invalidateQueries(),
  })

  return (
    <section className="space-y-3">
      {uploadPrompt && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest/30 bg-forest-soft p-4"><div><p className="text-sm font-semibold">Upload project requirements</p><p className="mt-1 text-xs text-muted">Choose source files to add as requirements for this project.</p></div><div className="flex gap-2"><Button loading={upload.isPending} onClick={() => fileInput.current?.click()}>Choose files</Button><Button variant="ghost" onClick={() => setUploadPrompt(false)}>Dismiss</Button></div></div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideTitle && <h2 className="font-display text-xl font-semibold">{title}</h2>}
        <div className="flex flex-wrap items-center gap-2">
          {kinds.length > 1 && (
            <div className="flex rounded-md border border-line bg-panel p-0.5 text-xs" role="radiogroup" aria-label="Source type">
              {kinds.map((k) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`rounded px-2 py-1 capitalize ${kind === k ? 'bg-forest text-paper' : 'text-muted hover:text-ink'}`}
                >
                  {k}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" icon={<NotebookPen className="size-4" />} onClick={() => setNoteOpen((v) => !v)}>
            Paste text
          </Button>
          {kind === 'knowledge' && (
            <Button variant="outline" icon={<Globe className="size-4" />} onClick={() => setWebsiteOpen((value) => !value)}>
              Add website
            </Button>
          )}
          <Button variant="outline" icon={<Upload className="size-4" />} loading={upload.isPending} onClick={() => fileInput.current?.click()}>
            Upload
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept={ACCEPTED_FILES}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length) upload.mutate(files)
            }}
          />
        </div>
      </div>

      {progress && <p className="font-mono text-xs text-muted">{progress}</p>}
      <ErrorNote error={upload.error ?? addNote.error ?? scrape.error ?? toggle.error ?? remove.error ?? sources.error} />

      {kind === 'knowledge' && websiteOpen && (
        <form
          className="flex flex-wrap gap-2 rounded-lg border border-line bg-panel p-3"
          onSubmit={(event) => {
            event.preventDefault()
            scrape.mutate()
          }}
        >
          <Input
            type="url"
            required
            maxLength={2_000}
            aria-label="Website URL"
            placeholder="https://example.com"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            className="min-w-64 flex-1"
          />
          <Button type="submit" icon={<Globe className="size-4" />} loading={scrape.isPending} disabled={!websiteUrl.trim()}>
            Import page
          </Button>
        </form>
      )}

      {noteOpen && (
        <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
          <Input placeholder="Title (e.g. Discovery call 12 Sep)" value={note.name} onChange={(e) => setNote({ ...note, name: e.target.value })} />
          <Textarea rows={6} placeholder="Paste meeting notes, email, chat…" value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
          <Button disabled={!note.text.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>
            Save as {kind}
          </Button>
        </div>
      )}

      <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
        {sources.data?.length === 0 && <li className="p-4 text-sm text-muted">Nothing yet — upload a file, paste text, or add a website as knowledge.</li>}
        {sources.data?.map((s) => (
          <li key={s.id} id={`source-${s.id}`} className={clsx('p-3 transition', !s.enabled && 'opacity-55')}>
            <div className="flex items-center gap-3">
              {s.mime_type?.startsWith('image/') ? <ImageIcon className="size-4 shrink-0 text-muted" /> : <FileText className="size-4 shrink-0 text-muted" />}
              <button className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                {s.name}
              </button>
              <Badge tone={s.kind === 'requirement' ? 'ember' : 'forest'}>{s.kind}</Badge>
              <span className="hidden font-mono text-[11px] text-muted sm:inline">
                {s.extracted_text ? `${Math.round(s.extracted_text.length / 1000)}k chars` : 'vision'}
              </span>
              <button
                aria-pressed={s.enabled}
                title={s.enabled ? 'Used by the AI — click to ignore this source' : 'Ignored by the AI — click to use it again'}
                className={clsx(
                  'flex items-center gap-1 rounded px-1.5 py-1 font-mono text-[11px] transition',
                  s.enabled ? 'text-forest hover:bg-forest-soft' : 'text-muted line-through hover:bg-line/60',
                )}
                disabled={toggle.isPending && toggle.variables?.id === s.id}
                onClick={() => toggle.mutate(s)}
              >
                {s.enabled ? <BrainCircuit className="size-3.5" /> : <Brain className="size-3.5" />}
                <span className="hidden sm:inline">{s.enabled ? 'AI' : 'off'}</span>
              </button>
              <button
                aria-label={`Move ${s.name} to Trash`}
                title="Move to Trash · recoverable for 30 days"
                className="rounded p-1 text-muted hover:bg-ember-soft hover:text-bad"
                onClick={() => confirm(`Move "${s.name}" to Trash? You can restore it within 30 days.`) && remove.mutate(s)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {expanded === s.id && (
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-paper p-3 font-mono text-xs whitespace-pre-wrap text-muted">
                {s.extracted_text || '(no extracted text — sent to Claude as an image / PDF)'}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
