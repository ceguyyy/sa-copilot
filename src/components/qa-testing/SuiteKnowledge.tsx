import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Trash2, Upload } from 'lucide-react'
import { Button, ErrorNote, Input, Textarea } from '../ui'
import { qaSuitesApi } from '../../lib/api'
import { ACCEPTED_FILES, extractText } from '../../lib/extract'

/** The suite's knowledge: uploaded files (their text) and pasted notes. It is what the agent should know. */
export function SuiteKnowledge({ suiteId }: { suiteId: string }) {
  const qc = useQueryClient()
  const key = ['qa-knowledge', suiteId]
  const knowledge = useQuery({ queryKey: key, queryFn: () => qaSuitesApi.knowledge(suiteId) })
  const fileInput = useRef<HTMLInputElement>(null)
  const [noteName, setNoteName] = useState('')
  const [noteText, setNoteText] = useState('')
  const [progress, setProgress] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: key })

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const [i, file] of files.entries()) {
        setProgress(`Reading ${file.name} (${i + 1}/${files.length})…`)
        await qaSuitesApi.upload(suiteId, file, await extractText(file).catch(() => ''))
      }
    },
    onSettled: async () => {
      setProgress('')
      if (fileInput.current) fileInput.current.value = ''
      await refresh()
    },
  })

  const addNote = useMutation({
    mutationFn: () => qaSuitesApi.addText(suiteId, noteName.trim() || 'Note', noteText),
    onSuccess: async () => {
      setNoteName('')
      setNoteText('')
      await refresh()
    },
  })

  const remove = useMutation({ mutationFn: qaSuitesApi.removeKnowledge, onSuccess: refresh })
  const error = upload.error ?? addNote.error ?? remove.error ?? knowledge.error
  const rows = knowledge.data ?? []

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" multiple hidden accept={ACCEPTED_FILES} onChange={(e) => e.target.files?.length && upload.mutate([...e.target.files])} />
        <Button variant="outline" icon={<Upload className="size-4" />} loading={upload.isPending} onClick={() => fileInput.current?.click()}>
          Upload knowledge files
        </Button>
        <span className="text-xs text-muted">{progress || 'PDF, Word, Excel, PowerPoint, text… Only the text is kept.'}</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">No knowledge yet. Upload the files the agent was trained on, or paste the text below.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {rows.map((k) => (
            <li key={k.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{k.name}</span>
              <span className="font-mono text-[11px] text-muted">{k.chars.toLocaleString()} chars</span>
              <Button variant="danger" aria-label={`Remove ${k.name}`} icon={<Trash2 className="size-4" />} onClick={() => confirm(`Remove ${k.name}?`) && remove.mutate(k.id)} />
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-lg border border-line bg-panel p-3">
        <summary className="cursor-pointer text-sm font-medium">Paste text</summary>
        <div className="mt-3 space-y-2">
          <Input value={noteName} onChange={(e) => setNoteName(e.target.value)} placeholder="Name, e.g. FAQ pendaftaran" maxLength={300} />
          <Textarea rows={6} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Knowledge text (SOP, FAQ, price list…)" />
          <Button variant="outline" icon={<Plus className="size-4" />} loading={addNote.isPending} disabled={!noteText.trim()} onClick={() => addNote.mutate()}>
            Add text
          </Button>
        </div>
      </details>
      {error && <ErrorNote error={error} />}
    </div>
  )
}
