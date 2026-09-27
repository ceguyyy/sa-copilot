import { useQueryClient } from '@tanstack/react-query'
import { Split } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { splitDiagram } from '../lib/ai'
import type { DocumentRow } from '../lib/types'
import { Button, ErrorNote, Input } from './ui'

interface Props {
  projectId: string
  documentId: string
  /** The project's documents, used to show the titles of the diagrams just created. */
  projectDocs: DocumentRow[]
  dirty: boolean
}

/** Breaks a big diagram into one diagram per lane (or per a custom rule); the original is kept. */
export function DiagramSplitPanel({ projectId, documentId, projectDocs, dirty }: Props) {
  const qc = useQueryClient()
  const [instruction, setInstruction] = useState('')
  const [running, setRunning] = useState(false)
  const [chars, setChars] = useState(0)
  const [created, setCreated] = useState<string[]>([])
  const [error, setError] = useState<unknown>(null)

  async function run() {
    setRunning(true)
    setChars(0)
    setError(null)
    setCreated([])
    try {
      const ids = await splitDiagram({ documentId, instruction: instruction.trim() || undefined }, setChars)
      await Promise.all([qc.invalidateQueries({ queryKey: ['documents', projectId] }), qc.invalidateQueries({ queryKey: ['files', projectId] })])
      setCreated(ids)
    } catch (e) {
      setError(e)
    } finally {
      setRunning(false)
    }
  }

  const titles = new Map(projectDocs.map((d) => [d.id, d.title]))

  return (
    <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Split className="size-4 text-forest" /> Split into diagrams
      </h2>
      <p className="text-xs text-muted">One diagram per lane (swimlane, actor or participant), each with its hand-offs kept. The original stays as it is.</p>
      <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Optional: e.g. per fase, bukan per lane" disabled={running} />
      {dirty && <p className="text-xs text-warn">Unsaved edits are not included — save first.</p>}
      <Button variant="outline" className="w-full" icon={<Split className="size-4" />} loading={running} onClick={run}>
        {running ? `Splitting… ${chars.toLocaleString()} chars` : 'Split per lane'}
      </Button>
      <ErrorNote error={error} />
      {created.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-ok">Created {created.length} diagrams:</p>
          <ul className="space-y-0.5 text-sm">
            {created.map((id) => (
              <li key={id}>
                <Link to={`/projects/${projectId}/docs/${id}`} className="text-forest hover:underline">
                  {titles.get(id) ?? 'Open diagram'}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
