import { describe, expect, it } from 'vitest'
import { nodesFromWorkflow, renderN8nCatalog } from './n8nNodes.ts'

const workflow = {
  name: 'My workflow 7189',
  nodes: [
    { parameters: {}, type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], id: 'a', name: 'When clicking ‘Execute workflow’' },
    {
      parameters: {},
      type: 'n8n-nodes-base.cekatCrm',
      typeVersion: 1,
      position: [208, 0],
      id: '7b520f03',
      name: 'Get all boards',
      credentials: { CekatOpenApi: { id: 'l2914snlbw9PhS92', name: 'SA GROUP 1' } },
    },
    { parameters: { event: 'message' }, type: 'n8n-nodes-base.cekatTrigger', typeVersion: 1, position: [0, 0], id: 'c', name: 'On message' },
  ],
}

describe('nodesFromWorkflow', () => {
  it('imports Cekat nodes, skips the manual trigger and detects triggers', () => {
    const nodes = nodesFromWorkflow(workflow)
    expect(nodes.map((n) => [n.name, n.node_type, n.kind])).toEqual([
      ['Get all boards', 'n8n-nodes-base.cekatCrm', 'action'],
      ['On message', 'n8n-nodes-base.cekatTrigger', 'trigger'],
    ])
  })

  it('drops ids, positions and credential ids but keeps the credential type', () => {
    const [node] = nodesFromWorkflow(workflow)
    expect(node.example).toEqual({ parameters: {}, type: 'n8n-nodes-base.cekatCrm', typeVersion: 1, name: 'Get all boards', credentials: { CekatOpenApi: { name: 'SA GROUP 1' } } })
    expect(JSON.stringify(node.example)).not.toContain('l2914snlbw9PhS92')
  })

  it('accepts a single node or garbage', () => {
    expect(nodesFromWorkflow(workflow.nodes[1])).toHaveLength(1)
    expect(nodesFromWorkflow('nope')).toEqual([])
    expect(nodesFromWorkflow({ nodes: [workflow.nodes[1], workflow.nodes[1]] })).toHaveLength(1)
  })
})

describe('renderN8nCatalog', () => {
  it('renders nothing for an empty catalog and the node type + example otherwise', () => {
    expect(renderN8nCatalog([])).toBe('')
    const text = renderN8nCatalog(nodesFromWorkflow(workflow))
    expect(text).toContain('Get all boards — n8n-nodes-base.cekatCrm (action)')
    expect(text).toContain('"CekatOpenApi"')
  })
})
