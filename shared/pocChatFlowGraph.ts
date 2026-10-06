// POC Flow as a positioned graph for the interactive canvas (React Flow): the Start point, every node of the tree,
// a red placeholder under each open path, and dotted edges for Jumps. Pure, so the layout is testable.
import { type ChatFlow, type DisplayKind, type DisplayNode, flowNodes, flowTree } from './pocChatFlow.ts'

export const FLOW_GRAPH_LAYOUT = { nodeWidth: 240, gapX: 40, levelHeight: 160 } as const

export type GraphNodeKind = DisplayKind | 'start' | 'open'

export type GraphNode = { id: string; kind: GraphNodeKind; label: string; summary: string; x: number; y: number }
export type GraphEdge = { id: string; source: string; target: string; kind: 'tree' | 'jump' | 'open' }

type Placed = { node: GraphNode; children: Placed[] }

const OPEN_LABEL = 'Add An End Node'

/** Tidy top-down layout: leaves take consecutive slots, each parent sits centred over its first and last child. */
export function flowGraph(flow: ChatFlow): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const { nodeWidth, gapX, levelHeight } = FLOW_GRAPH_LAYOUT
  const slot = nodeWidth + gapX
  let nextLeaf = 0

  const openNode = (parentId: string, depth: number): Placed => ({
    node: { id: `open-${parentId}`, kind: 'open', label: OPEN_LABEL, summary: '', x: nextLeaf++ * slot, y: depth * levelHeight },
    children: [],
  })

  const place = (n: { id: string; kind: GraphNodeKind; label: string; summary: string; isOpen: boolean; children: DisplayNode[] }, depth: number): Placed => {
    const children = [...n.children.map((c) => place(c, depth + 1)), ...(n.isOpen ? [openNode(n.id, depth + 1)] : [])]
    const x = children.length ? (children[0].node.x + children[children.length - 1].node.x) / 2 : nextLeaf++ * slot
    return { node: { id: n.id, kind: n.kind, label: n.label, summary: n.summary, x, y: depth * levelHeight }, children }
  }

  const root = place({ id: 'start', kind: 'start', label: 'Start point', summary: '', isOpen: !flow.start, children: flowTree(flow) }, 0)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const walk = (p: Placed) => {
    nodes.push(p.node)
    for (const c of p.children) {
      edges.push({ id: `${p.node.id}->${c.node.id}`, source: p.node.id, target: c.node.id, kind: c.node.kind === 'open' ? 'open' : 'tree' })
      walk(c)
    }
  }
  walk(root)

  const ids = new Set(nodes.map((n) => n.id))
  for (const n of flowNodes(flow)) {
    const action = n.node && 'kind' in n.node && n.node.kind === 'action' ? n.node.action : null
    if (action?.type === 'jump' && ids.has(action.targetId)) edges.push({ id: `${n.id}~>${action.targetId}`, source: n.id, target: action.targetId, kind: 'jump' })
  }
  return { nodes, edges }
}

/** Changes only when nodes are added, removed or a path opens/closes — what needs a fresh canvas layout. */
export const flowGraphKey = (flow: ChatFlow): string =>
  flowGraph(flow)
    .nodes.map((n) => n.id)
    .join('|')
