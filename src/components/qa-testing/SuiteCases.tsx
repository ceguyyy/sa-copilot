import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Textarea } from '../ui'
import type { QaSuiteCase } from '../../../shared/pocQa.ts'

type Props = { cases: QaSuiteCase[]; onChange: (cases: QaSuiteCase[]) => void }

const newCase = (): QaSuiteCase => ({ title: '', goal: '', steps: [{ user: '', ai: '', action: '' }] })

/** Editable test cases: per step what the customer types, the expected reply, and the expected (hidden) action. */
export function SuiteCases({ cases, onChange }: Props) {
  const setCase = (i: number, next: QaSuiteCase) => onChange(cases.map((c, j) => (j === i ? next : c)))
  const setStep = (i: number, s: number, patch: Partial<QaSuiteCase['steps'][number]>) =>
    setCase(i, { ...cases[i], steps: cases[i].steps.map((step, j) => (j === s ? { ...step, ...patch } : step)) })

  return (
    <div className="space-y-3">
      {cases.length === 0 && <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">No test case yet. Generate them with AI from the knowledge, or add one.</p>}
      {cases.map((c, i) => (
        <details key={i} open={!c.title} className="rounded-lg border border-line bg-panel p-3">
          <summary className="cursor-pointer font-display text-sm font-semibold">
            {i + 1}. {c.title || 'Untitled case'} <span className="font-mono text-[11px] font-normal text-muted">· {c.steps.length} steps</span>
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input aria-label="Case title" value={c.title} maxLength={200} onChange={(e) => setCase(i, { ...c, title: e.target.value })} placeholder="Case title" />
              <Input aria-label="Case goal" value={c.goal} maxLength={2000} onChange={(e) => setCase(i, { ...c, goal: e.target.value })} placeholder="Goal (what the customer achieves)" />
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => confirm(`Remove case "${c.title || i + 1}"?`) && onChange(cases.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
            {c.steps.map((s, j) => (
              <div key={j} className="grid gap-2 rounded-md border border-line bg-paper p-2 md:grid-cols-[1fr_1fr_0.8fr_auto]">
                <Textarea aria-label={`Step ${j + 1} customer message`} rows={2} value={s.user} onChange={(e) => setStep(i, j, { user: e.target.value })} placeholder={`${j + 1}. Customer types…`} />
                <Textarea aria-label={`Step ${j + 1} expected reply`} rows={2} value={s.ai} onChange={(e) => setStep(i, j, { ai: e.target.value })} placeholder="Expected reply (facts it must state)" />
                <Textarea aria-label={`Step ${j + 1} expected action`} rows={2} value={s.action} onChange={(e) => setStep(i, j, { action: e.target.value })} placeholder="Expected action (optional)" />
                <Button variant="ghost" aria-label={`Remove step ${j + 1}`} icon={<Trash2 className="size-4" />} onClick={() => setCase(i, { ...c, steps: c.steps.filter((_, k) => k !== j) })} />
              </div>
            ))}
            <Button variant="outline" icon={<Plus className="size-4" />} disabled={c.steps.length >= 40} onClick={() => setCase(i, { ...c, steps: [...c.steps, { user: '', ai: '', action: '' }] })}>
              Add step
            </Button>
          </div>
        </details>
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} disabled={cases.length >= 50} onClick={() => onChange([...cases, newCase()])}>
        Add case
      </Button>
    </div>
  )
}
