import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Select, Textarea } from '../../ui'
import { WelcomeImagePicker } from '../WelcomeImagePicker'
import { CopyField } from './CopyField'
import {
  CHAT_FLOW_LIMITS,
  type ChatFlow,
  type DisplayNode,
  type FlowAction,
  type FlowBranch,
  type FlowCondition,
  type FlowNode,
  type FlowStep,
  WEEK_DAYS,
  type WeekDay,
  jumpTargets,
  namedAgents,
  newButton,
  removeNode,
} from '../../../../shared/pocChatFlow.ts'
import { POC_LABEL_MAX_CHARS } from '../../../../shared/pocLimits.ts'

type Step<K extends FlowStep['kind']> = Extract<FlowStep, { kind: K }>

export type NodeFieldsProps = {
  node: DisplayNode
  flow: ChatFlow
  pocName: string
  /** Replace this node (immutably) in the flow. */
  patch: (fn: (node: FlowNode) => FlowNode) => void
  onFlowChange: (flow: ChatFlow) => void
}

const count = (value: string, max: number) => `${value.length.toLocaleString()} / ${max.toLocaleString()}`

/** The editable, copyable fields of one node; Else and Button Response nodes have none of their own. */
export function NodeFields(props: NodeFieldsProps) {
  const { node } = props
  if (!node.node) return null
  if (node.kind === 'condition') return <ConditionFields {...props} branch={node.node as FlowBranch} />
  if (node.kind === 'action') return <ActionFields {...props} step={node.node as Step<'action'>} />
  if (node.kind === 'buttons') return <ButtonsFields {...props} step={node.node as Step<'buttons'>} />
  if (node.kind === 'end') return <EndFields {...props} step={node.node as Step<'end'>} />
  return null
}

function ConditionFields({ branch, patch }: NodeFieldsProps & { branch: FlowBranch }) {
  const set = (condition: FlowCondition) => patch((n) => ({ ...(n as FlowBranch), condition }))
  const c = branch.condition
  if (c.type === 'firstMessageText') {
    return (
      <CopyField label="Trigger text (exact, case-sensitive)" copyText={c.text} counter={count(c.text, CHAT_FLOW_LIMITS.text)}>
        <Input aria-label="Trigger text" value={c.text} maxLength={CHAT_FLOW_LIMITS.text} onChange={(e) => set({ ...c, text: e.target.value })} placeholder="Your trigger message" />
      </CopyField>
    )
  }
  const toggle = (day: WeekDay) => set({ ...c, days: c.days.includes(day) ? c.days.filter((d) => d !== day) : WEEK_DAYS.filter((d) => d === day || c.days.includes(d)) })
  return (
    <div className="space-y-3">
      <CopyField label="Time range" copyText={`${c.from} - ${c.to}`}>
        <div className="flex items-center gap-2">
          <Input type="time" aria-label="From" value={c.from} onChange={(e) => set({ ...c, from: e.target.value })} />
          <span className="text-muted">–</span>
          <Input type="time" aria-label="To" value={c.to} onChange={(e) => set({ ...c, to: e.target.value })} />
        </div>
      </CopyField>
      <CopyField label="Days" copyText={c.days.join(', ')}>
        <div className="flex flex-wrap gap-1">
          {WEEK_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={c.days.includes(day)}
              onClick={() => toggle(day)}
              className={`rounded-md border px-2 py-1 text-xs font-medium transition ${c.days.includes(day) ? 'border-forest bg-forest-soft text-ink' : 'border-line text-muted hover:border-forest/40'}`}
            >
              {day}
            </button>
          ))}
        </div>
      </CopyField>
    </div>
  )
}

function ActionFields({ step, flow, patch }: NodeFieldsProps & { step: Step<'action'> }) {
  const set = (action: FlowAction) => patch((n) => ({ ...(n as Step<'action'>), action }))
  const a = step.action
  switch (a.type) {
    case 'addLabel':
      return (
        <CopyField label="Label" copyText={a.label}>
          <Input aria-label="Label" value={a.label} maxLength={POC_LABEL_MAX_CHARS} onChange={(e) => set({ ...a, label: e.target.value })} placeholder="e.g. Promo" />
        </CopyField>
      )
    case 'addCollaborator':
      return (
        <CopyField label="Collaborator" copyText={a.collaborator}>
          <Input aria-label="Collaborator" value={a.collaborator} maxLength={200} onChange={(e) => set({ ...a, collaborator: e.target.value })} placeholder="Agent or team name" />
        </CopyField>
      )
    case 'sendMessage':
      return (
        <CopyField label="Message" copyText={a.message} counter={count(a.message, CHAT_FLOW_LIMITS.message)}>
          <Textarea aria-label="Message" rows={3} value={a.message} maxLength={CHAT_FLOW_LIMITS.message} onChange={(e) => set({ ...a, message: e.target.value })} />
        </CopyField>
      )
    case 'webhook':
      return (
        <CopyField label="Webhook URL (no variables)" copyText={a.url}>
          <Input aria-label="Webhook URL" value={a.url} maxLength={2000} onChange={(e) => set({ ...a, url: e.target.value })} placeholder="https://…" />
        </CopyField>
      )
    case 'jump': {
      const targets = jumpTargets(flow, step.id)
      return (
        <CopyField label="Jump to node" copyText={targets.find((t) => t.id === a.targetId)?.label ?? ''}>
          <Select aria-label="Jump to node" value={a.targetId} onChange={(e) => set({ ...a, targetId: e.target.value })}>
            <option value="">Select a node…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.summary ? `${t.label}: ${t.summary.slice(0, 40)}` : t.label}
              </option>
            ))}
          </Select>
        </CopyField>
      )
    }
  }
}

function ButtonsFields({ step, flow, pocName, patch, onFlowChange }: NodeFieldsProps & { step: Step<'buttons'> }) {
  const set = (fields: Partial<Step<'buttons'>>) => patch((n) => ({ ...(n as Step<'buttons'>), ...fields }))
  const setLabel = (id: string, label: string) => set({ buttons: step.buttons.map((b) => (b.id === id ? { ...b, label } : b)) })
  const removeButton = (id: string, hasPath: boolean) => {
    if (hasPath && !confirm('Remove this button and every node after it?')) return
    onFlowChange(removeNode(flow, id))
  }
  return (
    <div className="space-y-3">
      <CopyField label="Message" copyText={step.message} counter={count(step.message, CHAT_FLOW_LIMITS.message)}>
        <Textarea aria-label="Message" rows={4} value={step.message} maxLength={CHAT_FLOW_LIMITS.message} onChange={(e) => set({ message: e.target.value })} />
      </CopyField>
      <WelcomeImagePicker label="Image (optional)" value={step.image} pocName={pocName} onChange={(image) => set({ image })} />
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Buttons ({step.buttons.length} / {CHAT_FLOW_LIMITS.buttons})
        </span>
        {step.buttons.map((b, i) => (
          <div key={b.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <CopyField label={`Button ${i + 1}`} copyText={b.label} counter={count(b.label, CHAT_FLOW_LIMITS.buttonChars)}>
                <Input aria-label={`Button ${i + 1}`} value={b.label} maxLength={CHAT_FLOW_LIMITS.buttonChars} onChange={(e) => setLabel(b.id, e.target.value)} />
              </CopyField>
            </div>
            <Button variant="ghost" className="mt-5" aria-label={`Remove button ${i + 1}`} icon={<Trash2 className="size-4" />} onClick={() => removeButton(b.id, !!b.next)} />
          </div>
        ))}
        <Button variant="outline" icon={<Plus className="size-4" />} disabled={step.buttons.length >= CHAT_FLOW_LIMITS.buttons} onClick={() => set({ buttons: [...step.buttons, newButton()] })}>
          Add button
        </Button>
      </div>
    </div>
  )
}

function EndFields({ step, patch }: NodeFieldsProps & { step: Step<'end'> }) {
  const end = step.end
  if (end.type === 'human') {
    return (
      <CopyField label="Human agents (comma-separated)" copyText={namedAgents(end.agents).join(', ')}>
        <Input
          aria-label="Human agents"
          value={end.agents.join(', ')}
          onChange={(e) => patch((n) => ({ ...(n as Step<'end'>), end: { type: 'human', agents: e.target.value.split(',').map((s) => s.trimStart()) } }))}
          placeholder="e.g. Sari, Budi"
        />
      </CopyField>
    )
  }
  return (
    <CopyField label="AI agent" copyText={end.agent}>
      <Input aria-label="AI agent" value={end.agent} maxLength={200} onChange={(e) => patch((n) => ({ ...(n as Step<'end'>), end: { type: 'ai', agent: e.target.value } }))} placeholder="e.g. Order Tracking Agent" />
    </CopyField>
  )
}
