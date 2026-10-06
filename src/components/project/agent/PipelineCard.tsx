import { Plus, Trash2 } from 'lucide-react'
import { Button, Input } from '../../ui'
import { ReviseHeading } from '../PocReviseParts'
import { defaultPipelineStep, type SetPocDraft } from '../pocConfig'
import type { PocRevise } from '../usePocRevise'
import type { PocPipelineStep } from '../../../lib/types'

type Props = { pipeline: PocPipelineStep[]; setDraft: SetPocDraft; revise: PocRevise }

/** Conversation pipeline: ordered statuses with the condition for moving into each. */
export function PipelineCard({ pipeline, setDraft, revise }: Props) {
  const setPipeline = (update: (steps: PocPipelineStep[]) => PocPipelineStep[]) => setDraft((prev) => ({ ...prev, pipeline: update(prev.pipeline) }))
  const updateStep = (index: number, patch: Partial<PocPipelineStep>) => setPipeline((all) => all.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <ReviseHeading title="Conversation Pipeline" action={revise.button({ kind: 'section', section: 'pipeline' })} />
      {revise.preview({ kind: 'section', section: 'pipeline' })}
      {pipeline.map((step, index) => (
        <div key={`pipeline-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3 md:grid-cols-[70px_1fr_1.5fr_auto]">
          <Input type="number" min={1} value={step.order} onChange={(e) => updateStep(index, { order: Number(e.target.value) || 1 })} />
          <Input value={step.status} onChange={(e) => updateStep(index, { status: e.target.value })} placeholder="Status name" />
          <Input value={step.condition} onChange={(e) => updateStep(index, { condition: e.target.value })} placeholder="Condition for this transition" />
          <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setPipeline((all) => all.filter((_, i) => i !== index))}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setPipeline((all) => [...all, defaultPipelineStep()])}>
        Add status
      </Button>
    </div>
  )
}
