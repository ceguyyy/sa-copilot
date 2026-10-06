import { Suspense, lazy, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Spinner } from '../../ui'
import { AddStepMenu } from './AddStepMenu'
import { InsertSlot, NodeEditor, OpenSlot } from './FlowNodeCard'
import { type ChatFlow, type FlowStep, flowNodes, validateFlow } from '../../../../shared/pocChatFlow.ts'
import { flowGraphKey } from '../../../../shared/pocChatFlowGraph.ts'

const ChatFlowCanvas = lazy(() => import('./ChatFlowCanvas'))

type Props = {
  flow: ChatFlow
  pocName: string
  onChange: (flow: ChatFlow) => void
  onClose: () => void
}

/** The node to select after adding a step: a new conditions group selects its first condition. */
const firstNodeOf = (step: FlowStep) => (step.kind === 'conditions' ? (step.branches[0]?.id ?? 'start') : step.id)

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)

/** Full-window editor: the canvas on the left, the selected node's fields (edit, add, remove) on the right. */
export function FlowFullscreen({ flow, pocName, onChange, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>('start')
  const problems = validateFlow(flow)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isTyping(e.target) && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${flow.name} — full screen editor`} className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2">
        <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{flow.name || 'Untitled flow'}</p>
        {problems.length ? (
          <span className="flex items-center gap-1 text-xs font-medium text-bad">
            <AlertTriangle className="size-3.5" /> {problems.length} to fix
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-ok">
            <CheckCircle2 className="size-3.5" /> Ready to build in Cekat
          </span>
        )}
        <button type="button" onClick={onClose} aria-label="Close full screen" title="Close (Esc)" className="rounded-md border border-line p-1.5 text-muted transition hover:border-forest hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-h-[50vh] p-3">
          <Suspense fallback={<Spinner label="Loading canvas…" />}>
            <ChatFlowCanvas key={`${flow.id}:${flowGraphKey(flow)}`} flow={flow} selectedId={selectedId} onSelect={setSelectedId} className="h-full" />
          </Suspense>
        </div>
        <aside className="min-h-0 space-y-4 overflow-auto border-t border-line bg-panel p-4 lg:border-l lg:border-t-0">
          <SidePanel flow={flow} pocName={pocName} selectedId={selectedId} onSelect={setSelectedId} onChange={onChange} />
          {problems.length > 0 && (
            <details className="rounded-lg border border-bad/40 bg-ember-soft p-3 text-xs text-bad">
              <summary className="cursor-pointer font-semibold">Flow must end with a configured Human or AI Agent ({problems.length})</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {problems.map((p, i) => (
                  <li key={`${i}-${p}`}>{p}</li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>
    </div>,
    document.body,
  )
}

type PanelProps = { flow: ChatFlow; pocName: string; selectedId: string | null; onSelect: (id: string | null) => void; onChange: (flow: ChatFlow) => void }

function SidePanel({ flow, pocName, selectedId, onSelect, onChange }: PanelProps) {
  const targetId = selectedId?.startsWith('open-') ? selectedId.slice('open-'.length) : selectedId
  if (!targetId) return <p className="text-sm text-muted">Click a node on the canvas to edit, add after or remove it.</p>

  if (targetId === 'start') {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-l-4 border-line border-l-forest bg-paper p-3">
          <div className="font-display text-sm font-semibold">Start point</div>
          <p className="text-xs text-muted">A chat comes in from the channel. It goes to a Condition or straight to End Flow.</p>
        </div>
        {flow.start ? (
          <p className="text-xs text-muted">Click a node under the Start point to edit it. To clear the start, remove the Start point&apos;s Else (it removes every condition).</p>
        ) : (
          <AddStepMenu
            slot="start"
            onAdd={(start) => {
              onChange({ ...flow, start })
              onSelect(firstNodeOf(start))
            }}
          />
        )}
      </div>
    )
  }

  const node = flowNodes(flow).find((n) => n.id === targetId)
  if (!node) return <p className="text-sm text-muted">This node was removed. Click another node on the canvas.</p>

  return (
    <div className="space-y-4">
      <NodeEditor node={node} flow={flow} pocName={pocName} onFlowChange={onChange} isAnchor={false} />
      {node.isOpen && <OpenSlot node={node} flow={flow} onFlowChange={onChange} onAdded={(step) => onSelect(firstNodeOf(step))} />}
      <InsertSlot node={node} flow={flow} onFlowChange={onChange} onAdded={(step) => onSelect(firstNodeOf(step))} />
      {node.children.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Next</span>
          <div className="flex flex-wrap gap-1">
            {node.children.map((c) => (
              <button key={c.id} type="button" onClick={() => onSelect(c.id)} className="rounded-md border border-line px-2 py-1 text-xs text-muted transition hover:border-forest hover:text-ink">
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
