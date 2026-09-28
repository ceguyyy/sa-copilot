import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DOC_LABELS, PIPELINE, type DocType } from '../../../shared/schemas.ts'
import type { DocumentRow } from '../../lib/types'

type Props = {
  projectId: string
  docs: DocumentRow[]
}

/** Progress bar + step timeline of the built-in deliverables: drafted, next up, and still to do. */
export function DeliverablesProgress({ projectId, docs }: Props) {
  const byType = new Map<DocType, DocumentRow>()
  for (const d of docs) if (!byType.has(d.type)) byType.set(d.type, d)
  const done = PIPELINE.filter((t) => byType.has(t)).length
  const percent = Math.round((done / PIPELINE.length) * 100)
  const next = PIPELINE.find((t) => !byType.has(t))

  return (
    <section aria-label="Deliverables progress" className="space-y-4 rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">Deliverables progress</h3>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{done}</span> of {PIPELINE.length} drafted{next ? <> · next: <span className="font-medium text-ink">{DOC_LABELS[next]}</span></> : ' · all done'}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${percent}% of deliverables drafted`}>
        <div className="h-full w-full origin-left rounded-full bg-forest transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <ol className="flex gap-0 overflow-x-auto pb-1">
        {PIPELINE.map((type, i) => {
          const doc = byType.get(type)
          const isNext = type === next
          const dot = doc
            ? 'border-forest bg-forest text-white'
            : isNext
              ? 'border-ember bg-ember-soft text-ember'
              : 'border-line bg-panel text-muted'
          const label = (
            <>
              <span className={`relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${dot}`}>
                {doc ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={`mt-2 block text-center text-xs leading-tight ${doc || isNext ? 'font-medium text-ink' : 'text-muted'}`}>{DOC_LABELS[type]}</span>
              <span className="mt-0.5 block text-center font-mono text-[10px] text-muted">
                {doc ? new Date(doc.updated_at).toLocaleDateString() : isNext ? 'next' : 'to do'}
              </span>
            </>
          )
          return (
            <li key={type} className="relative flex min-w-[72px] flex-1 flex-col items-center">
              {i > 0 && <span aria-hidden className={`absolute left-0 right-1/2 top-4 h-0.5 ${byType.has(PIPELINE[i - 1]) && doc ? 'bg-forest' : 'bg-line'}`} />}
              {i < PIPELINE.length - 1 && <span aria-hidden className={`absolute left-1/2 right-0 top-4 h-0.5 ${byType.has(PIPELINE[i + 1]) && doc ? 'bg-forest' : 'bg-line'}`} />}
              {doc ? (
                <Link to={`/projects/${projectId}/docs/${doc.id}`} className="flex flex-col items-center rounded-md px-1 hover:opacity-80" title={`Open ${DOC_LABELS[type]}`}>
                  {label}
                </Link>
              ) : (
                <span className="flex flex-col items-center px-1">{label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
