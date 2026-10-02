import { Play, Wand2 } from 'lucide-react'
import { Button, Input } from '../../ui'
import { type QaPlan, type QaPlanCase, fillVariables, variableValues } from '../../../../shared/pocQa.ts'

export type RunOptions = { headless: boolean; adaptive: boolean }

type Props = {
  plan: QaPlan
  onChange: (plan: QaPlan) => void
  options: RunOptions
  onOptionsChange: (options: RunOptions) => void
  /** Indexes of the cases that will run (the SA can leave some out). */
  selected: ReadonlySet<number>
  onToggle: (index: number) => void
  onRun: () => void
  isRunning: boolean
}

const fillDummies = (c: QaPlanCase): QaPlanCase => ({ ...c, variables: c.variables.map((v) => ({ ...v, value: v.value || v.dummy })) })

/** Before the run: the pre-chat form values and the data each happy case needs — typed by the SA or dummy. */
export function QaPlanForm({ plan, onChange, options, onOptionsChange, selected, onToggle, onRun, isRunning }: Props) {
  const setCase = (index: number, next: QaPlanCase) => onChange({ ...plan, cases: plan.cases.map((c, i) => (i === index ? next : c)) })
  // Cekat refuses to start the chat with an empty required field, so the run would only time out.
  const missing = plan.cases.some(
    (c, i) =>
      selected.has(i) &&
      ( c.variables.some((v) => !v.value.trim() && !v.dummy.trim()) || plan.contactFields.some((f) => f.required && !c.contact[f.label]?.trim())),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Fill in real test data, or keep the dummy. Empty fields use the dummy shown as placeholder.</p>
        <Button variant="outline" icon={<Wand2 className="size-4" />} onClick={() => onChange({ ...plan, cases: plan.cases.map(fillDummies) })}>
          Generate dummy for all
        </Button>
      </div>

      {plan.cases.map((c, i) => (
        <details key={`${i}-${c.title}`} open={i === 0} className={`rounded-lg border border-line bg-panel p-3 ${selected.has(i) ? '' : 'opacity-60'}`}>
          <summary className="cursor-pointer font-display text-sm font-semibold">
            <input
              type="checkbox"
              aria-label={`Run ${c.title}`}
              checked={selected.has(i)}
              onChange={() => onToggle(i)}
              onClick={(e) => e.stopPropagation()}
              className="mr-2 align-middle"
            />
            {i + 1}. {c.title} <span className="font-mono text-[11px] font-normal text-muted">· {c.steps.length} steps</span>
          </summary>
          <div className="mt-3 space-y-4">
            {plan.contactFields.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted">Livechat pre-chat form</legend>
                <div className="grid gap-2 md:grid-cols-2">
                  {plan.contactFields.map((f) => (
                    <label key={f.label} className="space-y-1 text-xs">
                      <span className="text-muted">
                        {f.label}
                        {f.required && ' *'}
                      </span>
                      <Input value={c.contact[f.label] ?? ''} placeholder={f.placeholder} onChange={(e) => setCase(i, { ...c, contact: { ...c.contact, [f.label]: e.target.value } })} />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {c.variables.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted">Data this case needs</legend>
                {c.variables.map((v, j) => (
                  <div key={v.key} className="grid items-end gap-2 md:grid-cols-[1fr_auto]">
                    <label className="space-y-1 text-xs">
                      <span className="text-muted">
                        {v.label} <span className="font-mono">{`{{${v.key}}}`}</span>
                      </span>
                      <Input
                        value={v.value}
                        placeholder={v.dummy}
                        onChange={(e) => setCase(i, { ...c, variables: c.variables.map((x, k) => (k === j ? { ...x, value: e.target.value } : x)) })}
                      />
                    </label>
                    <Button variant="ghost" icon={<Wand2 className="size-4" />} onClick={() => setCase(i, { ...c, variables: c.variables.map((x, k) => (k === j ? { ...x, value: x.dummy } : x)) })}>
                      Dummy
                    </Button>
                  </div>
                ))}
              </fieldset>
            ) : (
              <p className="text-xs text-muted">No extra data needed for this case.</p>
            )}

            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
              {c.steps.map((s, j) => (
                <li key={j}>
                  <span className="text-ink">{fillVariables(s.message, variableValues(c.variables))}</span>
                  {s.expectedAi && <span> → {s.expectedAi}</span>}
                </li>
              ))}
            </ol>
          </div>
        </details>
      ))}

      <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!options.headless} onChange={(e) => onOptionsChange({ ...options, headless: !e.target.checked })} />
          Show the browser while testing
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={options.adaptive} onChange={(e) => onOptionsChange({ ...options, adaptive: e.target.checked })} />
          AI adapts each customer message to the agent&apos;s last reply (otherwise the script is sent as is)
        </label>
        <p className="text-xs text-warn">Each happy case opens a real conversation in this livechat&apos;s Cekat inbox, with the contact data above.</p>
        <Button icon={<Play className="size-4" />} loading={isRunning} disabled={missing || selected.size === 0} onClick={onRun}>
          Run {selected.size} of {plan.cases.length} case{plan.cases.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  )
}
