import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DIAGRAM_KINDS } from '../../../shared/schemas.ts'
import type { DocumentRow } from '../../lib/types'
import { Badge, Select } from '../ui'
import { AiDraftButton } from '../AiDraftButton'

interface Props {
  projectId: string
  diagrams: DocumentRow[]
  running: boolean
  onGenerate: (diagramKind: string, instruction: string) => void
}

/** Mermaid diagrams of the project; each opens with full-screen preview, draw.io and split-per-lane. */
export function DiagramsPanel({ projectId, diagrams, running, onGenerate }: Props) {
  const [kind, setKind] = useState<string>('activity')

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm text-muted">Activity, sequence, state, ER… generated from the project context. Open one for full screen, draw.io and split per lane.</p>
        <div className="flex gap-2">
          <Select aria-label="Diagram kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-36">
            {DIAGRAM_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
          <AiDraftButton
            label="New diagram"
            icon={<GitBranch className="size-4" />}
            isLoading={running}
            isDisabled={running}
            placeholder="e.g. fokus ke alur eskalasi ke human agent, tampilkan integrasi Doctor Assist…"
            onRun={(instruction) => onGenerate(kind, instruction)}
          />
        </div>
      </div>
      {diagrams.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No diagrams yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {diagrams.map((d) => (
            <li key={d.id}>
              <Link to={`/projects/${projectId}/docs/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-forest-soft">
                <span className="truncate">{d.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {d.is_knowledge && <Badge tone="forest">knowledge</Badge>}
                  <span className="font-mono text-[11px] text-muted">{new Date(d.updated_at).toLocaleString()}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
