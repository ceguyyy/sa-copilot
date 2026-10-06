import { describe, expect, it } from 'vitest'
import {
  N8N_WORKFLOW_RULES,
  casesFromWorkflow,
  completeWorkflowExport,
  completeWorkflowLayout,
  n8nFromAi,
  normalizeN8n,
  parseWorkflow,
  parseWorkflowSections,
  prepareWorkflowReview,
  redactWorkflowSecrets,
  restoreWorkflowReview,
  restoreWorkflowSecrets,
} from './pocN8n.ts'

describe('workflow secret redaction', () => {
  it('redacts secrets before review and restores them after edits', () => {
    const workflow = {
      nodes: [{ name: 'Client API', parameters: { apiKey: 'private-key', timeout: 30 } }],
      connections: {},
    }

    const redacted = redactWorkflowSecrets(workflow)
    const reviewed = structuredClone(redacted.workflow)
    reviewed.nodes[0].parameters.timeout = 45

    expect(redacted.workflow.nodes[0].parameters.apiKey).not.toBe('private-key')
    expect(restoreWorkflowSecrets(reviewed, redacted.secrets)).toEqual({
      nodes: [{ name: 'Client API', parameters: { apiKey: 'private-key', timeout: 45 } }],
      connections: {},
    })
    expect(workflow.nodes[0].parameters).toEqual({ apiKey: 'private-key', timeout: 30 })
  })

  it('rejects a review that removed a secret-bearing field', () => {
    const { secrets } = redactWorkflowSecrets({ nodes: [{ parameters: { password: 'private' } }], connections: {} })
    expect(() => restoreWorkflowSecrets({ nodes: [{ parameters: {} }], connections: {} }, secrets)).toThrow(/secret-bearing field/)
  })
})

describe('workflow review preparation', () => {
  it('keeps execution data and credential references local while preparing the AI payload', () => {
    const workflow = {
      id: 'instance-id',
      pinData: { Webhook: [{ json: { requesterName: 'Private person' } }] },
      nodes: [{ id: 'node-id', name: 'API', credentials: { httpHeaderAuth: { id: 'credential-id', name: 'Production' } }, parameters: { timeout: 30 } }],
      connections: {},
    }
    const prepared = prepareWorkflowReview(workflow)
    const proposed = structuredClone(prepared.workflow)
    proposed.nodes[0].parameters.timeout = 45

    expect(prepared.workflow).not.toHaveProperty('pinData')
    expect(prepared.workflow).not.toHaveProperty('id')
    expect(prepared.workflow.nodes[0].credentials).toBe('[REDACTED_SECRET_0]')
    expect(restoreWorkflowReview(proposed, prepared)).toMatchObject({
      id: 'instance-id',
      pinData: { Webhook: [{ json: { requesterName: 'Private person' } }] },
      nodes: [{ credentials: { httpHeaderAuth: { id: 'credential-id', name: 'Production' } }, parameters: { timeout: 45 } }],
    })
  })
})

const workflow = { name: 'buat_tiket', nodes: [{ name: 'Webhook', type: 'n8n-nodes-base.webhook', parameters: {} }], connections: {} }

describe('parseWorkflow', () => {
  it('accepts an n8n workflow export (nodes + connections)', () => {
    expect(parseWorkflow(JSON.stringify(workflow))).toEqual({ ok: true, workflow })
  })

  it('explains what is wrong with anything else', () => {
    expect(parseWorkflow('{ nope')).toMatchObject({ ok: false })
    expect(parseWorkflow('{"nodes": {}}')).toEqual({ ok: false, error: 'An n8n workflow needs a "nodes" array and a "connections" object' })
    expect(parseWorkflow('[]')).toMatchObject({ ok: false })
  })
})

describe('n8nFromAi', () => {
  it('keeps the workflow with pretty JSON, one cURL per use case and test notes', () => {
    const n8n = n8nFromAi({
      workflows: [
        {
          name: 'Procurement Gateway',
          description: 'One webhook, routed by action',
          workflowJson: JSON.stringify(workflow),
          cases: [
            { action: 'create_ticket', title: 'Create a ticket', curl: "```bash\ncurl -X POST 'https://workflows.cekat.ai/webhook/x'\n```" },
            { action: 'get_ticket', title: '', curl: '' },
          ],
          testNotes: 'Expect ticket id TKT-…',
        },
        { name: '', workflowJson: '{}' },
      ],
    })
    expect(n8n.workflows).toEqual([
      {
        name: 'Procurement Gateway',
        description: 'One webhook, routed by action',
        json: expect.any(String),
        cases: [{ action: 'create_ticket', title: 'Create a ticket', curl: "curl -X POST 'https://workflows.cekat.ai/webhook/x'" }],
        testNotes: 'Expect ticket id TKT-…',
      },
    ])
    const json = n8n.workflows[0].json
    expect(json).toContain('\n  "nodes"') // pretty-printed
    expect(JSON.parse(json)).toMatchObject({ ...workflow, nodes: workflow.nodes.map((n) => expect.objectContaining(n)) })
  })

  it('names an unnamed workflow instead of dropping it, and reads use cases from its Switch when none were written', () => {
    const gateway = {
      nodes: [
        { name: 'Webhook Trigger', type: 'n8n-nodes-base.webhook', parameters: { httpMethod: 'POST', path: '/gw' } },
        { name: 'Switch Action', type: 'n8n-nodes-base.switch', parameters: { value1: '={{ $json.action }}', rules: { rules: [{ value2: 'create_ticket' }] } } },
      ],
      connections: {},
    }
    const [w] = n8nFromAi({ workflows: [{ name: '', workflowJson: JSON.stringify(gateway), cases: [] }] }).workflows
    expect(w.name).toBe('n8n gateway workflow')
    expect(w.cases.map((c) => c.action)).toEqual(['create_ticket'])
    expect(w.cases[0].curl).toContain("'https://workflows.cekat.ai/webhook/gw'")
  })

  it('caps AI text at the stored limits', () => {
    const long = 'x'.repeat(30_000)
    const [w] = n8nFromAi({ workflows: [{ name: long, description: long, workflowJson: JSON.stringify(workflow), cases: [{ action: long, title: long, curl: long }], testNotes: long }] }).workflows
    expect([w.name.length, w.description.length, w.testNotes.length]).toEqual([200, 5_000, 5_000])
    expect([w.cases[0].action.length, w.cases[0].title.length, w.cases[0].curl.length]).toEqual([120, 500, 20_000])
  })

  it('keeps invalid JSON as written so the SA can fix it instead of losing it', () => {
    const n8n = n8nFromAi({ workflows: [{ name: 'Broken', workflowJson: '```json\n{ "nodes": [ }\n```' }] })
    expect(n8n.workflows[0].json).toBe('{ "nodes": [ }')
  })
})

describe('normalizeN8n', () => {
  it('gives POCs saved before n8n workflows existed an empty list', () => {
    expect(normalizeN8n(undefined)).toEqual({ workflows: [] })
  })

  it('turns the single cURL of a workflow saved before use cases existed into one use case', () => {
    const legacy = { workflows: [{ name: 'Buat tiket', tool: 'buat_tiket', description: '', json: '{}', curl: 'curl x', testNotes: '' }] }
    expect(normalizeN8n(legacy as never).workflows).toEqual([
      { name: 'Buat tiket', description: '', json: '{}', cases: [{ action: 'buat_tiket', title: 'Buat tiket', curl: 'curl x' }], testNotes: '' },
    ])
    const noCurl = { workflows: [{ name: 'x', tool: '', description: '', json: '{}', curl: '', testNotes: '' }] }
    expect(normalizeN8n(noCurl as never).workflows[0].cases).toEqual([])
  })
})

describe('N8N_WORKFLOW_RULES', () => {
  it('asks for ONE gateway workflow with every use case routed by action, one cURL each', () => {
    expect(N8N_WORKFLOW_RULES).toMatch(/ONE complete, importable n8n workflow for the whole POC/)
    expect(N8N_WORKFLOW_RULES).toMatch(/1 use case = 1 cURL/)
    expect(N8N_WORKFLOW_RULES).toMatch(/"action"/)
    expect(N8N_WORKFLOW_RULES).toMatch(/Switch Action/)
  })

  it('follows the exported workflow structure (node names, types, parameters, connections, metadata)', () => {
    for (const piece of ['Webhook Trigger', 'Validate & Extract Payload', 'Is Payload Valid?', 'Respond to Webhook', 'n8n-nodes-base.cekatCrm', '"executionOrder": "v1"', '"selectValue"', '"main"']) {
      expect(N8N_WORKFLOW_RULES).toContain(piece)
    }
  })

  it('makes select values zero-based and keeps the complete cURL and generated id rules', () => {
    expect(N8N_WORKFLOW_RULES).toMatch(/zero-based/i)
    expect(N8N_WORKFLOW_RULES).toMatch(/complete cURL/i)
    expect(N8N_WORKFLOW_RULES).toMatch(/Code node/)
    expect(N8N_WORKFLOW_RULES).toMatch(/ticket/i)
  })
})

describe('parseWorkflowSections', () => {
  it('reads a workflow with one cURL per use case written as plain-text sections', () => {
    const text = [
      'Sure, here it is.',
      '## NAME',
      'Procurement Gateway - POC 01',
      '## DESCRIPTION',
      'Validates input, routes by action, creates the CRM item.',
      '## WORKFLOW',
      '```json',
      '{"name":"x","nodes":[],"connections":{}}',
      '```',
      '## CASES',
      '### create_ticket',
      'Create a ticket',
      '```bash',
      "curl -X POST 'https://workflows.cekat.ai/webhook/x' \\",
      "  -H 'Content-Type: application/json'",
      '```',
      '### get_ticket',
      'Check a ticket',
      '```bash',
      "curl -X POST 'https://workflows.cekat.ai/webhook/x'",
      '```',
      '## TEST NOTES',
      'Returns ticket_id.',
    ].join('\n')
    expect(parseWorkflowSections(text)).toEqual({
      name: 'Procurement Gateway - POC 01',
      description: 'Validates input, routes by action, creates the CRM item.',
      workflowJson: '{"name":"x","nodes":[],"connections":{}}',
      cases: [
        { action: 'create_ticket', title: 'Create a ticket', curl: ["curl -X POST 'https://workflows.cekat.ai/webhook/x' \\", "  -H 'Content-Type: application/json'"].join('\n') },
        { action: 'get_ticket', title: 'Check a ticket', curl: "curl -X POST 'https://workflows.cekat.ai/webhook/x'" },
      ],
      testNotes: 'Returns ticket_id.',
    })
  })

  it('takes only the fenced cURL, whatever the fence label, and ignores prose after it', () => {
    const text = ['## WORKFLOW', '{"nodes":[],"connections":{}}', '## CASES', '### a', 'Title', '```shell\r', "curl -X POST 'x'", '```', 'Returns 200.', '### b', '```', 'curl b', '```'].join('\n')
    expect(parseWorkflowSections(text)!.cases).toEqual([
      { action: 'a', title: 'Title', curl: "curl -X POST 'x'" },
      { action: 'b', title: '', curl: 'curl b' },
    ])
  })

  it('keeps a CASES section written without ### headings as one use case', () => {
    const text = ['## WORKFLOW', '{"nodes":[],"connections":{}}', '## CASES', '```bash', 'curl x', '```'].join('\n')
    expect(parseWorkflowSections(text)!.cases).toEqual([{ action: '', title: '', curl: 'curl x' }])
  })

  it('returns null when the answer has no workflow section', () => {
    expect(parseWorkflowSections('I could not do it.')).toBeNull()
  })
})

describe('completeWorkflowLayout', () => {
  const link = (node: string) => [{ node, type: 'main', index: 0 }]
  const workflow = () => ({
    name: 'Buat tiket',
    nodes: [
      { name: 'Webhook', type: 'n8n-nodes-base.webhook', parameters: {} },
      { name: 'Validate', type: 'n8n-nodes-base.code', parameters: {} },
      { name: 'Respond 400', type: 'n8n-nodes-base.respondToWebhook', parameters: {} },
      { name: 'Respond OK', type: 'n8n-nodes-base.respondToWebhook', parameters: {}, id: 'keep-me', position: [9, 9] },
    ],
    connections: {
      Webhook: { main: [link('Validate')] },
      Validate: { main: [link('Respond OK'), link('Respond 400')] },
    },
  })

  it('adds unique ids and left-to-right positions by step, keeping ones the model wrote', () => {
    const nodes = completeWorkflowLayout(workflow()).nodes as { name: string; id: string; position: number[] }[]
    const byName = Object.fromEntries(nodes.map((n) => [n.name, n]))
    expect(new Set(nodes.map((n) => n.id)).size).toBe(4)
    expect(byName['Respond OK']).toMatchObject({ id: 'keep-me', position: [9, 9] })
    expect(byName.Webhook.position[0]).toBeLessThan(byName.Validate.position[0])
    expect(byName.Validate.position[0]).toBeLessThan(byName['Respond 400'].position[0])
  })

  it('stacks nodes of the same step vertically and survives loops', () => {
    const wf = workflow()
    const looped = { ...wf, nodes: wf.nodes.map(({ id: _id, position: _p, ...n }) => n), connections: { ...wf.connections, 'Respond 400': { main: [link('Validate')] } } }
    const nodes = completeWorkflowLayout(looped).nodes as { name: string; position: number[] }[]
    const [ok, bad] = ['Respond OK', 'Respond 400'].map((name) => nodes.find((n) => n.name === name)!.position)
    expect(ok[0]).toBe(bad[0])
    expect(ok[1]).not.toBe(bad[1])
  })

  it('is applied to AI workflows, and the rules tell the model to skip ids and positions', () => {
    const [w] = n8nFromAi({ workflows: [{ name: 'x', workflowJson: JSON.stringify(workflow()) }] }).workflows
    expect(JSON.parse(w.json).nodes[0]).toHaveProperty('position')
    expect(N8N_WORKFLOW_RULES).toMatch(/no node ids, positions or webhookId/i)
  })
})

describe('completeWorkflowExport', () => {
  it('fills the export metadata and webhook ids an n8n export has, keeping what is there', () => {
    const done = completeWorkflowExport({
      name: 'Gateway',
      nodes: [
        { name: 'Webhook Trigger', type: 'n8n-nodes-base.webhook', parameters: {} },
        { name: 'Other hook', type: 'n8n-nodes-base.webhook', parameters: {}, webhookId: 'keep' },
        { name: 'Code', type: 'n8n-nodes-base.code', parameters: {} },
      ],
      connections: {},
      settings: { timezone: 'Asia/Jakarta' },
    })
    expect(done).toMatchObject({ pinData: {}, active: false, tags: [], settings: { executionOrder: 'v1', binaryMode: 'separate', timezone: 'Asia/Jakarta' } })
    const nodes = done.nodes as { webhookId?: string }[]
    expect(nodes[0].webhookId).toMatch(/^[0-9a-f-]{36}$/)
    expect(nodes[1].webhookId).toBe('keep')
    expect(nodes[2]).not.toHaveProperty('webhookId')
  })

  it('is applied to AI workflows', () => {
    const [w] = n8nFromAi({ workflows: [{ name: 'x', workflowJson: JSON.stringify(workflow) }] }).workflows
    expect(JSON.parse(w.json)).toMatchObject({ settings: { executionOrder: 'v1' }, pinData: {}, active: false })
  })
})

describe('casesFromWorkflow', () => {
  // The shape of an exported gateway (e.g. "Siloam Procurement Gateway - POC 01.json"): Switch v1 and v3.4.
  const gateway = {
    name: 'Siloam Procurement Gateway - POC 01',
    nodes: [
      { name: 'Webhook Trigger', type: 'n8n-nodes-base.webhook', typeVersion: 1.1, parameters: { httpMethod: 'POST', path: 'siloam-procurement', responseMode: 'responseNode', options: {} } },
      {
        name: 'Switch Action',
        type: 'n8n-nodes-base.switch',
        typeVersion: 1,
        parameters: { dataType: 'string', value1: '={{ $json.action }}', rules: { rules: [{ value2: 'get_vendor_by_phone' }, { value2: 'register_vendor', output: 1 }, { value2: 'get_vendor_by_phone' }] } },
      },
      {
        name: 'Switch',
        type: 'n8n-nodes-base.switch',
        typeVersion: 3.4,
        parameters: { rules: { values: [{ conditions: { conditions: [{ leftValue: '={{ $json.response.data[0].item_id }}', rightValue: '' }] } }] } },
      },
    ],
    connections: {},
    pinData: {},
    meta: { instanceId: 'x' },
  }

  it('reads one use case per action of the Switch Action, each with a cURL to the webhook', () => {
    const cases = casesFromWorkflow(gateway)
    expect(cases.map((c) => c.action)).toEqual(['get_vendor_by_phone', 'register_vendor'])
    expect(cases[1].curl).toContain("curl -X POST 'https://workflows.cekat.ai/webhook/siloam-procurement'")
    expect(cases[1].curl).toContain('"action": "register_vendor"')
  })

  it('reads actions from a rules-based Switch (v3) comparing $json.action', () => {
    const v3 = {
      ...gateway,
      nodes: [
        gateway.nodes[0],
        {
          name: 'Route',
          type: 'n8n-nodes-base.switch',
          typeVersion: 3.4,
          parameters: { rules: { values: ['create_pr', 'get_pr'].map((a) => ({ conditions: { conditions: [{ leftValue: '={{ $json.action }}', rightValue: a }] } })) } },
        },
      ],
    }
    expect(casesFromWorkflow(v3).map((c) => c.action)).toEqual(['create_pr', 'get_pr'])
  })

  it('has no use cases when nothing routes on action', () => {
    expect(casesFromWorkflow(workflow)).toEqual([])
  })
})
