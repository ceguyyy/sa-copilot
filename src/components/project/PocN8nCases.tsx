import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { CopyButton } from '../CopyButton'
import { Button, Field, Input, Textarea } from '../ui'
import type { PocN8nCase } from '../../../shared/pocN8n.ts'

type Props = {
  cases: PocN8nCase[]
  /** API integration names, suggested as actions. */
  tools: string[]
  onChange: (cases: PocN8nCase[]) => void
}

const emptyCase = (action = ''): PocN8nCase => ({ action, title: '', curl: '' })

/** The use cases of the gateway workflow: 1 use case = 1 cURL, each routed by its "action". */
export function PocN8nCases({ cases, tools, onChange }: Props) {
  const actionsListId = useId()
  const update = (index: number, patch: Partial<PocN8nCase>) => onChange(cases.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  const nextAction = tools.find((t) => !cases.some((c) => c.action === t)) ?? ''
  const allCurls = cases
    .filter((c) => c.curl.trim())
    .map((c) => `# ${c.action || 'use case'}${c.title ? ` — ${c.title}` : ''}\n${c.curl}`)
    .join('\n\n')

  return (
    <section className="space-y-3" aria-label="Use cases">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold">Use cases · {cases.length}</h5>
          <p className="text-xs text-muted">One cURL per use case, all to this workflow&apos;s webhook; the body&apos;s &quot;action&quot; picks the Switch Action branch.</p>
        </div>
        {cases.length > 1 && <CopyButton text={allCurls} label="Copy all cURLs" title="Every use case's cURL, one after another, each under a # comment" />}
      </div>
      <datalist id={actionsListId}>
        {tools.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {cases.length === 0 && <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">No use case yet. Add one per action the workflow routes.</p>}
      {cases.map((c, i) => (
        <div key={i} className="space-y-2 rounded-md border border-line bg-panel p-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto_auto] md:items-end">
            <Field label="Action">
              <Input list={actionsListId} value={c.action} onChange={(e) => update(i, { action: e.target.value })} placeholder="e.g. create_ticket" className="font-mono text-xs" />
            </Field>
            <Field label="Use case">
              <Input value={c.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="e.g. Create a procurement ticket" />
            </Field>
            <CopyButton text={c.curl} label="Copy cURL" title="Paste into Postman (Import → Raw text) or a terminal" />
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => onChange(cases.filter((_, x) => x !== i))}>
              Remove
            </Button>
          </div>
          <Textarea
            rows={5}
            className="font-mono text-xs"
            aria-label={`cURL for ${c.action || `use case ${i + 1}`}`}
            value={c.curl}
            onChange={(e) => update(i, { curl: e.target.value })}
            placeholder={`curl -X POST 'https://workflows.cekat.ai/webhook/…' -H 'Content-Type: application/json' --data-raw '{"action": "${c.action || '…'}", …}'`}
            spellCheck={false}
          />
        </div>
      ))}
      <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => onChange([...cases, emptyCase(nextAction)])}>
        Add use case
      </Button>
    </section>
  )
}
