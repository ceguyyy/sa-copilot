import '@xyflow/react/dist/style.css'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Background, Controls, Handle, MiniMap, type Edge, type Node, type NodeProps, Panel, Position, ReactFlow, applyNodeChanges, getNodesBounds, getViewportForBounds, useReactFlow } from '@xyflow/react'
import { CopyImageButton } from '../../CopyImageButton'
import { appBackground, elementToPng } from '../../../lib/copyImage'
import clsx from 'clsx'
import { type GraphEdge, type GraphNode, type GraphNodeKind, FLOW_GRAPH_LAYOUT, flowGraph } from '../../../../shared/pocChatFlowGraph.ts'
import type { ChatFlow } from '../../../../shared/pocChatFlow.ts'

type Props = {
  flow: ChatFlow
  /** Canvas node id that is selected ("start", a node id, or "open-<parent id>"); its path is highlighted. */
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Height of the canvas box, e.g. "h-[520px]" or "h-full". */
  className?: string
}

type CanvasNode = Node<{ graph: GraphNode; isOnPath: boolean }, 'flow'>

// Cekat colours: Start blue, conditions yellow, actions and messages blue, End green, open paths red.
const KIND_STYLE: Record<GraphNodeKind, { band: string; name: string }> = {
  start: { band: 'bg-forest text-paper', name: 'Start' },
  condition: { band: 'bg-warn/20 text-warn', name: 'Condition' },
  button: { band: 'bg-warn/20 text-warn', name: 'Button' },
  else: { band: 'bg-warn/20 text-warn', name: 'Else' },
  action: { band: 'bg-forest-soft text-forest', name: 'Action' },
  buttons: { band: 'bg-ember-soft text-ember', name: 'Message' },
  end: { band: 'bg-ok/15 text-ok', name: 'End Flow' },
  open: { band: 'bg-bad/10 text-bad', name: 'Open path' },
}

function FlowCard({ data, selected }: NodeProps<CanvasNode>) {
  const { graph, isOnPath } = data
  const style = KIND_STYLE[graph.kind]
  const isOpen = graph.kind === 'open'
  return (
    <div
      title={graph.summary || graph.label}
      style={{ width: FLOW_GRAPH_LAYOUT.nodeWidth }}
      className={clsx(
        'overflow-hidden rounded-lg border bg-panel text-left shadow-sm transition',
        isOpen ? 'border-dashed border-bad' : 'border-line',
        (selected || isOnPath) && 'ring-2 ring-forest',
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border-0 !bg-muted" isConnectable={false} />
      <div className={clsx('px-3 py-1 font-mono text-[10px] uppercase tracking-wider', style.band)}>{style.name}</div>
      <div className="space-y-1 px-3 py-2">
        <div className="text-xs font-semibold text-ink">{graph.label}</div>
        {graph.summary && <div className="line-clamp-3 text-[11px] text-muted">{graph.summary}</div>}
        {isOpen && <div className="text-[11px] text-bad">Click to add the next node</div>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-0 !bg-muted" isConnectable={false} />
    </div>
  )
}

const NODE_TYPES = { flow: FlowCard }

/** Node ids from the Start point down to this node (following tree edges only). */
function pathTo(id: string | null, edges: GraphEdge[]): Set<string> {
  const parent = new Map(edges.filter((e) => e.kind !== 'jump').map((e) => [e.target, e.source]))
  const path = new Set<string>()
  for (let cur = id; cur; cur = parent.get(cur) ?? null) path.add(cur)
  return path
}

const toCanvasNode = (graph: GraphNode, isOnPath: boolean): CanvasNode => ({ id: graph.id, type: 'flow', position: { x: graph.x, y: graph.y }, data: { graph, isOnPath } })

function toCanvasEdge(e: GraphEdge, path: Set<string>): Edge {
  const isOnPath = e.kind === 'tree' && path.has(e.source) && path.has(e.target)
  if (e.kind === 'jump') return { id: e.id, source: e.source, target: e.target, label: 'jump', type: 'smoothstep', animated: true, style: { strokeDasharray: '6 4', stroke: 'var(--ember)' } }
  if (e.kind === 'open') return { id: e.id, source: e.source, target: e.target, type: 'smoothstep', style: { strokeDasharray: '4 4', stroke: 'var(--bad)' } }
  return { id: e.id, source: e.source, target: e.target, type: 'smoothstep', animated: isOnPath, style: { stroke: isOnPath ? 'var(--forest)' : 'var(--muted)', strokeWidth: isOnPath ? 2 : 1 } }
}

const appScheme = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

/** Interactive canvas of the flow, like the Cekat builder: pan, zoom, drag, minimap; click a node to edit it. */
export default function ChatFlowCanvas({ flow, selectedId, onSelect, className = 'h-[520px]' }: Props) {
  const graph = useMemo(() => flowGraph(flow), [flow])
  const box = useRef<HTMLDivElement>(null)
  const [scheme, setScheme] = useState(appScheme)
  const path = useMemo(() => pathTo(selectedId, graph.edges), [selectedId, graph.edges])
  // Positions (incl. drags) live in state; labels and the highlight come from the flow on every render. The parent
  // remounts this canvas when the set of nodes changes, so a new node gets a fresh layout.
  const [nodes, setNodes] = useState<CanvasNode[]>(() => graph.nodes.map((n) => toCanvasNode(n, false)))
  const shown = useMemo(() => {
    const byId = new Map(graph.nodes.map((g) => [g.id, g]))
    return nodes.map((n) => {
      const g = byId.get(n.id)
      return g ? { ...n, data: { graph: g, isOnPath: path.has(n.id) } } : n
    })
  }, [nodes, graph.nodes, path])
  const edges = useMemo(() => graph.edges.map((e) => toCanvasEdge(e, path)), [graph.edges, path])

  useEffect(() => {
    const observer = new MutationObserver(() => setScheme(appScheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={box} className={clsx('overflow-hidden rounded-lg border border-line bg-panel', className)}>
      <ReactFlow
        nodes={shown}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        nodesConnectable={false}
        colorMode={scheme}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
      >
        <Background gap={20} />
        <Panel position="top-right">
          <CanvasImageButton box={box} />
        </Panel>
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-paper" nodeColor={(n) => ((n as CanvasNode).data.graph.kind === 'open' ? 'var(--bad)' : 'var(--line)')} />
      </ReactFlow>
    </div>
  )
}

const IMAGE_PADDING = 40
const MAX_IMAGE_SIDE = 6000

/** Copies the whole flow (not just the visible part) as a PNG, at 100% zoom. */
function CanvasImageButton({ box }: { box: RefObject<HTMLDivElement | null> }) {
  const { getNodes } = useReactFlow()
  const render = () => {
    const viewport = box.current?.querySelector<HTMLElement>('.react-flow__viewport')
    if (!viewport) return Promise.reject(new Error('The canvas is not ready'))
    const bounds = getNodesBounds(getNodes())
    const width = Math.min(MAX_IMAGE_SIDE, Math.ceil(bounds.width + IMAGE_PADDING * 2))
    const height = Math.min(MAX_IMAGE_SIDE, Math.ceil(bounds.height + IMAGE_PADDING * 2))
    const { x, y, zoom } = getViewportForBounds(bounds, width, height, 0.1, 1, 0.05)
    return elementToPng(viewport, { backgroundColor: appBackground(), width, height, style: { width: `${width}px`, height: `${height}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` } })
  }
  return <CopyImageButton getImage={render} />
}
