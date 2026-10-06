import { type ReactNode, useState } from 'react'
import { AlertTriangle, CheckCircle2, GitBranch, Plus, Trash2 } from 'lucide-react'
import type { AiRunOptions } from '../../../lib/useOutputLimit'
import { AiDraftButton } from '../../AiDraftButton'
import { Button, Field, Input } from '../../ui'
import { AddStepMenu } from './AddStepMenu'
import { FlowNodeCard } from './FlowNodeCard'
import { FlowVisual } from './FlowVisual'
import { CHAT_FLOW_LIMITS, type ChatFlow, type ChatFlows, flowTree, newFlow, validateFlow } from '../../../../shared/pocChatFlow.ts'

type Props = {
  chatFlows: ChatFlows
  pocName: string
  onChange: (chatFlows: ChatFlows) => void
  /** Drafts the flows with AI from the saved POC (the flows themselves stay rule-based). */
  onGenerate: (instruction: string, options: AiRunOptions) => void
  isGenerating: boolean
  isDisabled: boolean
  /** Live status of the running generation. */
  status?: ReactNode
}

/** POC Flow: Cekat Flow builder flows (no AI), shown as a tree with copyable fields to rebuild them in Cekat by hand. */
export function ChatFlowSection({ chatFlows, pocName, onChange, onGenerate, isGenerating, isDisabled, status }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const flows = chatFlows.flows
  const flow = flows.find((f) => f.id === selectedId) ?? flows[0] ?? null

  const setFlow = (next: ChatFlow) => onChange({ flows: flows.map((f) => (f.id === next.id ? next : f)) })
  const addFlow = () => {
    const created = newFlow(`Flow ${flows.length + 1}`)
    onChange({ flows: [...flows, created] })
    setSelectedId(created.id)
  }
  const deleteFlow = (target: ChatFlow) => {
    if (!confirm(`Delete flow "${target.name}"?`)) return
    onChange({ flows: flows.filter((f) => f.id !== target.id) })
    setSelectedId(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold">POC Flow</h4>
          <p className="text-xs text-muted">
            Cekat Flow builder, no AI. A chat from the channel enters at the Start point; every path ends with a Human or AI agent (Flow → AI only, never AI → Flow). Copy each field into Cekat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AiDraftButton
            label={flows.length ? 'Regenerate with AI' : 'Generate with AI'}
            icon={<GitBranch className="size-4" />}
            isLoading={isGenerating}
            isDisabled={isDisabled}
            onRun={onGenerate}
            placeholder="e.g. business hours vs after hours, main menu routing to the order tracking AI agent"
          />
          <Button variant="outline" icon={<Plus className="size-4" />} disabled={flows.length >= CHAT_FLOW_LIMITS.flows} onClick={addFlow}>
            New flow
          </Button>
        </div>
      </div>
      {isGenerating && status}

      {flows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No flow yet. Click Generate with AI to draft flows from the saved POC, or New flow to build one from the Start point.</p>
      ) : (
        <div role="tablist" aria-label="Flows" className="flex flex-wrap gap-2">
          {flows.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={flow?.id === f.id}
              onClick={() => setSelectedId(f.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${flow?.id === f.id ? 'border-forest bg-forest-soft text-ink' : 'border-line text-muted hover:border-forest/40'}`}
            >
              {f.name || 'Untitled flow'}
              {validateFlow(f).length > 0 && <span className="ml-2 inline-block size-2 rounded-full bg-bad align-middle" aria-label="has problems" />}
            </button>
          ))}
        </div>
      )}

      {flow && <FlowEditor key={flow.id} flow={flow} pocName={pocName} onChange={setFlow} onDelete={() => deleteFlow(flow)} />}
    </div>
  )
}

function FlowEditor({ flow, pocName, onChange, onDelete }: { flow: ChatFlow; pocName: string; onChange: (flow: ChatFlow) => void; onDelete: () => void }) {
  const problems = validateFlow(flow)
  const tree = flowTree(flow)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Flow name">
            <Input value={flow.name} maxLength={200} onChange={(e) => onChange({ ...flow, name: e.target.value })} placeholder="e.g. Inbound WhatsApp" />
          </Field>
        </div>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={onDelete}>
          Delete flow
        </Button>
      </div>

      <ValidationBox problems={problems} />

      <FlowVisual flow={flow} pocName={pocName} onChange={onChange} />

      <div className="space-y-3 rounded-lg border border-line bg-paper p-4">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Nodes</h5>
        <div data-flow-node="start" className="rounded-lg border border-l-4 border-line border-l-forest bg-panel p-3">
          <div className="font-display text-sm font-semibold">Start point</div>
          <p className="text-xs text-muted">A chat comes in from the channel. Add a Condition or End Flow.</p>
        </div>
        <div className="ml-3 space-y-3 border-l-2 border-dashed border-line pl-4">
          {tree.map((node) => (
            <FlowNodeCard key={node.id} node={node} flow={flow} pocName={pocName} onFlowChange={onChange} />
          ))}
          {!flow.start && <AddStepMenu slot="start" onAdd={(start) => onChange({ ...flow, start })} />}
        </div>
      </div>
    </div>
  )
}

/** Same message and format as Cekat's save error, so the SA knows the flow will save there. */
function ValidationBox({ problems }: { problems: string[] }) {
  if (!problems.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-ok/40 bg-forest-soft p-3 text-sm text-ok">
        <CheckCircle2 className="size-4" /> Every path ends with a configured Human or AI Agent — ready to build in Cekat.
      </div>
    )
  }
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-bad/40 bg-ember-soft p-3 text-sm text-bad">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4" /> Flow must end with a configured Human or AI Agent
      </div>
      <ul className="list-disc space-y-0.5 pl-6">
        {problems.map((p, i) => (
          <li key={`${i}-${p}`}>{p}</li>
        ))}
      </ul>
    </div>
  )
}
