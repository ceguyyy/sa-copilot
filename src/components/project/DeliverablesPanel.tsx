import type { AiRunOptions } from '../../lib/useOutputLimit'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DOC_LABELS, PIPELINE, type DocType } from '../../../shared/schemas.ts'
import type { DocumentRow } from '../../lib/types'
import { STEP_HINT } from '../../lib/deliverables'
import { AiDraftButton } from '../AiDraftButton'
import { Badge } from '../ui'


interface Props {
  projectId: string
  docs: DocumentRow[]
  running: DocType | null
  onGenerate: (type: DocType, instruction: string, options: AiRunOptions) => void
}

/** The built-in pipeline: one card per deliverable, drafted by the AI or opened for editing. */
export function DeliverablesPanel({ projectId, docs, running, onGenerate }: Props) {
  const byType = new Map<DocType, DocumentRow>()
  for (const d of docs) if (!byType.has(d.type)) byType.set(d.type, d)

  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {PIPELINE.map((type, i) => {
        const doc = byType.get(type)
        return (
          <li key={type} className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-panel p-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ember">0{i + 1}</span>
                <span className="flex gap-1">
                  {doc?.is_knowledge && <Badge tone="forest">knowledge</Badge>}
                  {doc ? <Badge tone="ok">drafted</Badge> : <Badge>empty</Badge>}
                </span>
              </div>
              <h3 className="mt-2 font-display text-lg font-semibold">{DOC_LABELS[type]}</h3>
              <p className="text-xs text-muted">{STEP_HINT[type]}</p>
            </div>
            {doc ? (
              <Link to={`/projects/${projectId}/docs/${doc.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">
                Open · updated {new Date(doc.updated_at).toLocaleDateString()} <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <AiDraftButton label="Draft with AI" align="left" isLoading={running === type} isDisabled={!!running} onRun={(instruction, options) => onGenerate(type, instruction, options)} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
