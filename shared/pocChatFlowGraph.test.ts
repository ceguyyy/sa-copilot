import { describe, expect, it } from 'vitest'
import { FLOW_GRAPH_LAYOUT, flowGraph } from './pocChatFlowGraph.ts'
import type { ChatFlow, FlowStep } from './pocChatFlow.ts'

const end = (id: string): FlowStep => ({ id, kind: 'end', end: { type: 'ai', agent: 'Bot' } })

const flow: ChatFlow = {
  id: 'f',
  name: 'Inbound',
  start: {
    id: 'c',
    kind: 'conditions',
    branches: [
      { id: 'b1', condition: { type: 'firstMessageText', text: 'PROMO' }, next: end('e1') },
      { id: 'b2', condition: { type: 'firstMessageText', text: 'INFO' }, next: null },
    ],
    elseId: 'else',
    elseNext: { id: 'j', kind: 'action', action: { type: 'jump', targetId: 'e1' }, next: null },
  },
}

describe('flowGraph', () => {
  it('lays the flow out top-down from the Start point with tree and jump edges', () => {
    const { nodes, edges } = flowGraph(flow)
    expect(nodes.map((n) => n.id)).toEqual(['start', 'b1', 'e1', 'b2', 'open-b2', 'else', 'j'])
    const y = Object.fromEntries(nodes.map((n) => [n.id, n.y]))
    expect(y.start).toBe(0)
    expect(y.b1).toBe(FLOW_GRAPH_LAYOUT.levelHeight)
    expect(y.e1).toBe(2 * FLOW_GRAPH_LAYOUT.levelHeight)
    expect(edges).toContainEqual({ id: 'start->b1', source: 'start', target: 'b1', kind: 'tree' })
    expect(edges).toContainEqual({ id: 'j~>e1', source: 'j', target: 'e1', kind: 'jump' })
    expect(edges).toContainEqual({ id: 'b2->open-b2', source: 'b2', target: 'open-b2', kind: 'open' })
  })

  it('never overlaps nodes on the same level and centres a parent over its children', () => {
    const { nodes } = flowGraph(flow)
    const x = Object.fromEntries(nodes.map((n) => [n.id, n.x]))
    const step = FLOW_GRAPH_LAYOUT.nodeWidth + FLOW_GRAPH_LAYOUT.gapX
    const level1 = nodes.filter((n) => n.y === FLOW_GRAPH_LAYOUT.levelHeight).map((n) => n.x)
    level1.slice(1).forEach((v, i) => expect(v - level1[i]).toBeGreaterThanOrEqual(step))
    expect(x.start).toBe((x.b1 + x.else) / 2)
  })

  it('shows only the Start point and one open slot for an empty flow', () => {
    const { nodes, edges } = flowGraph({ id: 'f', name: 'Empty', start: null })
    expect(nodes.map((n) => [n.id, n.kind])).toEqual([
      ['start', 'start'],
      ['open-start', 'open'],
    ])
    expect(edges).toHaveLength(1)
  })
})
