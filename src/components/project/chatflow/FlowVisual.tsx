import { Suspense, lazy, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { CopyButton } from '../../CopyButton'
import { MermaidView } from '../../MermaidView'
import { Spinner, Textarea } from '../../ui'
import { FlowFullscreen } from './FlowFullscreen'
import { type ChatFlow, flowMermaid, flowOutline } from '../../../../shared/pocChatFlow.ts'
import { flowGraphKey } from '../../../../shared/pocChatFlowGraph.ts'

// React Flow is only loaded when a POC Flow is opened.
const ChatFlowCanvas = lazy(() => import('./ChatFlowCanvas'))

type View = 'canvas' | 'tree'
const VIEWS: { id: View; label: string }[] = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'tree', label: 'Tree' },
]

/** Scrolls the editor to a node's card and flashes it. */
function revealCard(id: string) {
  const card = document.querySelector<HTMLElement>(`[data-flow-node="${CSS.escape(id)}"]`)
  if (!card) return
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  card.animate([{ boxShadow: '0 0 0 3px var(--forest)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400, easing: 'ease-out' })
}

type Props = { flow: ChatFlow; pocName: string; onChange: (flow: ChatFlow) => void }

/** The flow as an interactive canvas (React Flow) or a Mermaid tree, plus the copyable text outline. */
export function FlowVisual({ flow, pocName, onChange }: Props) {
  const [view, setView] = useState<View>('canvas')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isFull, setIsFull] = useState(false)
  const outline = flowOutline(flow)

  const select = (id: string | null) => {
    setSelectedId(id)
    if (id) revealCard(id.startsWith('open-') ? id.slice('open-'.length) : id)
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold uppercase tracking-wide text-muted">Visual</h5>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFull(true)}
            title="Edit the flow on a full-screen canvas"
            className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted transition hover:border-forest hover:text-ink"
          >
            <Maximize2 className="size-3" /> Full screen edit
          </button>
          <div role="tablist" aria-label="Flow view" className="inline-flex rounded-lg border border-line p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${view === v.id ? 'bg-forest text-paper' : 'text-muted hover:text-ink'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {isFull && <FlowFullscreen flow={flow} pocName={pocName} onChange={onChange} onClose={() => setIsFull(false)} />}

      {view === 'canvas' ? (
        <>
          <Suspense fallback={<Spinner label="Loading canvas…" />}>
            <ChatFlowCanvas key={`${flow.id}:${flowGraphKey(flow)}`} flow={flow} selectedId={selectedId} onSelect={select} />
          </Suspense>
          <p className="text-xs text-muted">
            Drag to pan, scroll to zoom, drag nodes to rearrange. Click a node to highlight its path and jump to its fields below, or use Full screen edit to add and remove nodes on
            the canvas.
          </p>
        </>
      ) : flow.start ? (
        <MermaidView source={flowMermaid(flow)} title={`${pocName} — ${flow.name}`} filename={`${pocName}-${flow.name}-flow`} />
      ) : (
        <p className="text-sm text-muted">Add the first node below to see the tree.</p>
      )}

      <details>
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">Text outline (every field)</summary>
        <Textarea readOnly rows={Math.min(20, outline.split('\n').length + 1)} value={outline} className="mt-2 font-mono text-xs" />
      </details>
      <div className="flex justify-end">
        <CopyButton text={outline} label="Copy outline" title="The whole flow as an indented text tree" />
      </div>
    </div>
  )
}
