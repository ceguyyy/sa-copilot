import { Plus, Trash2 } from 'lucide-react'
import { Button, Input } from '../../ui'
import { ReviseHeading } from '../PocReviseParts'
import { defaultLabel, type SetPocDraft } from '../pocConfig'
import type { PocRevise } from '../usePocRevise'
import { POC_LABEL_MAX_CHARS } from '../../../../shared/pocLimits.ts'
import type { PocLabel } from '../../../lib/types'

type Props = { labels: PocLabel[]; setDraft: SetPocDraft; revise: PocRevise }

/** AI Action — Labels: each label with the condition for attaching it. */
export function LabelsCard({ labels, setDraft, revise }: Props) {
  const setLabels = (update: (labels: PocLabel[]) => PocLabel[]) => setDraft((prev) => ({ ...prev, labels: update(prev.labels) }))
  const updateLabel = (index: number, patch: Partial<PocLabel>) => setLabels((all) => all.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <ReviseHeading title="AI Action — Labels" action={revise.button({ kind: 'section', section: 'labels' })} />
      {revise.preview({ kind: 'section', section: 'labels' })}
      {labels.map((label, index) => (
        <div key={`label-${index}`} className="grid gap-3 rounded-lg border border-line bg-panel p-3 md:grid-cols-[1fr_1.5fr_auto]">
          <Input value={label.name} onChange={(e) => updateLabel(index, { name: e.target.value })} maxLength={POC_LABEL_MAX_CHARS} placeholder="Label name" />
          <Input value={label.condition} onChange={(e) => updateLabel(index, { condition: e.target.value })} maxLength={POC_LABEL_MAX_CHARS} placeholder="When this label should be attached" />
          <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setLabels((all) => all.filter((_, i) => i !== index))}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setLabels((all) => [...all, defaultLabel()])}>
        Add label
      </Button>
    </div>
  )
}
