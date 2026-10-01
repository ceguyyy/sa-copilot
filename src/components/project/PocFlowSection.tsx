import type { AiRunOptions } from '../../lib/useOutputLimit'
import type { ReactNode } from 'react'
import { Workflow } from 'lucide-react'
import { AiDraftButton } from '../AiDraftButton'
import { CopyButton } from '../CopyButton'
import { MermaidView } from '../MermaidView'
import { Field, Textarea } from '../ui'
import { happyCaseScript } from '../../../shared/pocFlow.ts'
import type { HappyCase, PocFlow } from '../../lib/types'

type Props = {
  flow: PocFlow
  pocName: string
  onChange: (flow: PocFlow) => void
  onGenerate: (instruction: string, options: AiRunOptions) => void
  isGenerating: boolean
  isDisabled: boolean
  /** Live status of the running generation, shown under the button. */
  status?: ReactNode
  /** "Revise with AI" button and its diff preview (revises the flow on screen instead of regenerating). */
  reviseAction?: ReactNode
  revisePreview?: ReactNode
}

/** POC conversation flowchart plus happy cases: step-by-step scenarios to try the agent in Cekat. */
export function PocFlowSection({ flow, pocName, onChange, onGenerate, isGenerating, isDisabled, status, reviseAction, revisePreview }: Props) {
  const allScripts = flow.happyCases.map(happyCaseScript).join('\n\n---\n\n')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold">Flow & Happy Case</h4>
          <p className="text-xs text-muted">How the conversation flows through labels, pipeline, tools and handoff, and scenarios to try the agent in Cekat. Generated from the saved POC.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reviseAction}
          <AiDraftButton
            label={flow.mermaid ? 'Regenerate with AI' : 'Generate with AI'}
            icon={<Workflow className="size-4" />}
            isLoading={isGenerating}
            isDisabled={isDisabled}
            onRun={onGenerate}
            placeholder="e.g. focus on the booking and reschedule flows"
          />
        </div>
      </div>
      {isGenerating && status}
      {revisePreview}

      <div className="space-y-3 rounded-lg border border-line bg-paper p-4">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Flowchart</h5>
        {flow.mermaid ? (
          <MermaidView source={flow.mermaid} title={`${pocName} — conversation flow`} filename={`${pocName}-flow`} />
        ) : (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No flowchart yet. Click Generate with AI (after Draft with AI or filling in the POC Agent).</p>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-ink">Edit Mermaid source</summary>
          <Field label="Mermaid">
            <Textarea rows={10} className="font-mono text-xs" value={flow.mermaid} onChange={(e) => onChange({ ...flow, mermaid: e.target.value })} placeholder={'flowchart TD\n  A["Welcome"] --> B{"Intent?"}'} />
          </Field>
        </details>
      </div>

      <div className="space-y-3 rounded-lg border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Happy cases</h5>
          {flow.happyCases.length > 1 && <CopyButton text={allScripts} label="Copy all cases" />}
        </div>
        {flow.happyCases.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No happy case yet.</p>
        ) : (
          flow.happyCases.map((c, i) => <HappyCaseCard key={`${c.title}-${i}`} happyCase={c} index={i} />)
        )}
      </div>
    </div>
  )
}

function HappyCaseCard({ happyCase, index }: { happyCase: HappyCase; index: number }) {
  return (
    <article className="space-y-3 rounded-lg border border-line bg-panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            <span className="mr-2 font-mono text-xs text-muted">#{index + 1}</span>
            {happyCase.title}
          </p>
          {happyCase.goal && <p className="text-sm text-muted">Goal: {happyCase.goal}</p>}
        </div>
        <CopyButton text={happyCaseScript(happyCase)} label="Copy script" title="Numbered test script: what to type in the Cekat chat and what should happen" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 py-2 pr-2">#</th>
              <th className="py-2 pr-3">User types</th>
              <th className="py-2 pr-3">Expected AI reply</th>
              <th className="py-2">Expected action</th>
            </tr>
          </thead>
          <tbody>
            {happyCase.steps.map((s, i) => (
              <tr key={i} className="border-b border-line/60 align-top last:border-0">
                <td className="py-2 pr-2 font-mono text-xs text-muted">{i + 1}</td>
                <td className="py-2 pr-3 font-medium text-ink">{s.user}</td>
                <td className="py-2 pr-3">{s.ai}</td>
                <td className="py-2 font-mono text-xs">{s.action || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}
