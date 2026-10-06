import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../ui'
import { AddStepMenu } from './AddStepMenu'
import { NodeFields } from './NodeFields'
import { type ChatFlow, type DisplayKind, type DisplayNode, type FlowNode, type FlowStep, canInsertAfter, insertAfter, newBranch, removeNode, setSlot, updateNode } from '../../../../shared/pocChatFlow.ts'

type Props = {
  node: DisplayNode
  flow: ChatFlow
  pocName: string
  onFlowChange: (flow: ChatFlow) => void
}

// Cekat colours: conditions yellow, actions and messages blue, End green.
const KIND_STYLE: Record<DisplayKind, string> = {
  condition: 'border-l-warn',
  button: 'border-l-warn',
  else: 'border-l-warn',
  action: 'border-l-forest',
  buttons: 'border-l-ember',
  end: 'border-l-ok',
}

/** The conditions group under the Start point when this node is its Else. */
const conditionsOwnerOf = (flow: ChatFlow, node: DisplayNode) =>
  node.kind === 'else' && flow.start?.kind === 'conditions' && flow.start.id === node.ownerId ? flow.start : null

type EditorProps = Props & {
  /** Marks the card as the scroll target for canvas clicks (false for the full-screen side panel copy). */
  isAnchor?: boolean
}

/** One node's card: Cekat label, remove, its fields, and "add condition" on the Start point's Else. */
export function NodeEditor({ node, flow, pocName, onFlowChange, isAnchor = true }: EditorProps) {
  const patch = (fn: (n: FlowNode) => FlowNode) => onFlowChange(updateNode(flow, node.id, fn))
  const conditionsOwner = conditionsOwnerOf(flow, node)
  const addCondition = (type: 'firstMessageText' | 'firstMessageTime') =>
    conditionsOwner && onFlowChange(updateNode(flow, conditionsOwner.id, (o) => ({ ...o, branches: [...(o as typeof conditionsOwner).branches, newBranch(type)] }) as FlowNode))

  // Removable: steps and condition branches; button branches go from their Message, an Else with its group.
  const removeId = node.kind === 'button' ? null : node.kind === 'else' ? (conditionsOwner?.id ?? null) : node.id
  const remove = () => {
    if (!removeId) return
    const what = node.kind === 'else' ? 'all conditions under the Start point' : node.label
    if (node.children.length || node.kind === 'else') {
      if (!confirm(`Remove ${what} and every node after it?`)) return
    }
    onFlowChange(removeNode(flow, removeId))
  }

  return (
    <div data-flow-node={isAnchor ? node.id : undefined} className={clsx('space-y-3 rounded-lg border border-l-4 border-line bg-panel p-3', KIND_STYLE[node.kind])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-sm font-semibold text-ink">{node.label}</div>
          {node.kind === 'else' && <p className="text-xs text-muted">This path will be taken if other conditions are not met.</p>}
          {node.kind === 'button' && <p className="text-xs text-muted">Button: {node.summary || '(no label yet)'}</p>}
        </div>
        {removeId && <Button variant="danger" aria-label={`Remove ${node.label}`} title={`Remove ${node.label}`} icon={<Trash2 className="size-4" />} onClick={remove} />}
      </div>
      <NodeFields node={node} flow={flow} pocName={pocName} patch={patch} onFlowChange={onFlowChange} />
      {conditionsOwner && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => addCondition('firstMessageText')}>
            Condition: First Message Text
          </Button>
          <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => addCondition('firstMessageTime')}>
            Condition: First Message Time
          </Button>
        </div>
      )}
    </div>
  )
}

/** The red "+" under a path that stops without an End node. */
export function OpenSlot({ node, flow, onFlowChange, onAdded }: Omit<Props, 'pocName'> & { onAdded?: (step: FlowStep) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-bad">Add An End Node — this path stops here.</p>
      <AddStepMenu
        slot="next"
        onAdd={(step) => {
          onFlowChange(setSlot(flow, node, step))
          onAdded?.(step)
        }}
      />
    </div>
  )
}

/** The "+" between this node and the next one: inserts a node and keeps the rest of the path after it. */
export function InsertSlot({ node, flow, onFlowChange, onAdded }: Omit<Props, 'pocName'> & { onAdded?: (step: FlowStep) => void }) {
  if (node.isOpen || !node.children.length || !canInsertAfter(node)) return null
  return (
    <AddStepMenu
      slot="insert"
      onAdd={(step) => {
        onFlowChange(insertAfter(flow, node, step))
        onAdded?.(step)
      }}
    />
  )
}

/** One node of the flow with its fields, then its children indented below it, like a branch of the Cekat canvas. */
export function FlowNodeCard({ node, flow, pocName, onFlowChange }: Props) {
  return (
    <div className="space-y-3">
      <NodeEditor node={node} flow={flow} pocName={pocName} onFlowChange={onFlowChange} />
      {(node.children.length > 0 || node.isOpen) && (
        <div className="ml-3 space-y-3 border-l-2 border-dashed border-line pl-4">
          <InsertSlot node={node} flow={flow} onFlowChange={onFlowChange} />
          {node.children.map((child) => (
            <FlowNodeCard key={child.id} node={child} flow={flow} pocName={pocName} onFlowChange={onFlowChange} />
          ))}
          {node.isOpen && <OpenSlot node={node} flow={flow} onFlowChange={onFlowChange} />}
        </div>
      )}
    </div>
  )
}
