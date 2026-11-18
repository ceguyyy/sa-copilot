import { Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Button, Input, Textarea } from '../../ui'
import { ReviseField } from '../PocReviseParts'
import type { SetPocDraft } from '../pocConfig'
import type { PocRevise } from '../usePocRevise'
import type { PocConfig, PocCustomInstruction } from '../../../lib/types'
import { BEHAVIOR_LIMITS, BEHAVIOR_SEGMENTS, MAX_CUSTOM_INSTRUCTIONS } from '../../../../shared/pocBehavior.ts'

type Props = { draft: PocConfig; setDraft: SetPocDraft; revise: PocRevise }

/** "1.234 / 5.000" under a text field; red once the text is over the limit (e.g. a migrated legacy prompt). */
function CharCount({ length, max }: { length: number; max: number }) {
  const over = length > max
  return (
    <p className={clsx('text-right font-mono text-xs', over ? 'font-semibold text-bad' : 'text-muted')} aria-live="polite">
      {length.toLocaleString()} / {max.toLocaleString()}
      {over && ' — too long, shorten it or move part of it to another segment'}
    </p>
  )
}

/** The AI Agent Behavior prompt in segments: three fixed ones and any number of custom instructions. */
export function BehaviorSegments({ draft, setDraft, revise }: Props) {
  const setCustom = (update: (items: PocCustomInstruction[]) => PocCustomInstruction[]) =>
    setDraft((prev) => ({ ...prev, customInstructions: update(prev.customInstructions) }))
  const updateCustom = (index: number, patch: Partial<PocCustomInstruction>) =>
    setCustom((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const canAdd = draft.customInstructions.length < MAX_CUSTOM_INSTRUCTIONS

  return (
    <div className="space-y-4">
      {BEHAVIOR_SEGMENTS.map(({ key, label, hint }) => (
        <ReviseField key={key} label={label} action={revise.button({ kind: 'field', field: key }, { iconOnly: true })} preview={revise.preview({ kind: 'field', field: key })}>
          <p className="text-xs text-muted">{hint}</p>
          <Textarea
            aria-label={label}
            rows={key === 'conversationFlow' ? 10 : 6}
            value={draft[key]}
            onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
          />
          <CharCount length={draft[key].length} max={BEHAVIOR_LIMITS[key]} />
        </ReviseField>
      ))}

      <div className="space-y-3">
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted">Custom Instructions</h5>
          <p className="text-xs text-muted">Extra instructions that fit none of the segments above, e.g. promo rules or a special case.</p>
        </div>
        {draft.customInstructions.map((item, index) => (
          <div key={`custom-instruction-${index}`} className="grid gap-2 rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Custom instruction ${index + 1} title`}
                value={item.title}
                maxLength={BEHAVIOR_LIMITS.customInstructionTitle}
                onChange={(e) => updateCustom(index, { title: e.target.value })}
                placeholder={`Custom Instruction ${index + 1}`}
              />
              <Button variant="ghost" icon={<Trash2 className="size-4" />} aria-label={`Remove custom instruction ${index + 1}`} onClick={() => setCustom((items) => items.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
            <ReviseField
              label="Instruction"
              action={revise.button({ kind: 'field', field: 'customInstruction', index }, { iconOnly: true })}
              preview={revise.preview({ kind: 'field', field: 'customInstruction', index })}
            >
              <Textarea aria-label={`Custom instruction ${index + 1}`} rows={4} value={item.content} onChange={(e) => updateCustom(index, { content: e.target.value })} />
              <CharCount length={item.content.length} max={BEHAVIOR_LIMITS.customInstruction} />
            </ReviseField>
          </div>
        ))}
        <Button variant="outline" icon={<Plus className="size-4" />} disabled={!canAdd} onClick={() => setCustom((items) => [...items, { title: '', content: '' }])}>
          Add custom instruction
        </Button>
        {!canAdd && <p className="text-xs text-muted">At most {MAX_CUSTOM_INSTRUCTIONS} custom instructions.</p>}
      </div>
    </div>
  )
}
