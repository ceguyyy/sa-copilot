import { describe, expect, it } from 'vitest'
import { buildGatewayWorkflow } from './pocN8nBuild.ts'
import { casesFromWorkflow, parseWorkflow } from './pocN8n.ts'

const ticket = {
  name: 'create_ticket',
  httpMethod: 'POST' as const,
  description: 'Create a support ticket.',
  webhookAddress: 'https://workflows.cekat.ai/webhook/xhealth-gateway',
  apiKey: 'super-secret-token',
  aiInput: { type: 'object', properties: { title: { type: 'string' }, phone: { type: 'string' } }, required: ['title'] },
  targetMethod: 'POST' as const,
  targetUrl: 'https://da.example.com/api/tickets',
  authUrl: 'https://da.example.com/api/login',
}
const status = {
  name: 'get_status',
  httpMethod: 'POST' as const,
  description: '',
  webhookAddress: '',
  aiInput: { type: 'object', properties: { ticket_id: { type: 'string' } }, required: ['ticket_id'] },
  targetMethod: 'GET' as const,
  targetUrl: 'https://da.example.com/api/status',
  authUrl: '',
}

const build = (integrations = [ticket, status]) => buildGatewayWorkflow({ clientName: 'Xhealth', pocName: 'AI Booking', integrations })
const json = (integrations?: (typeof ticket | typeof status)[]) => {
  const parsed = parseWorkflow(build(integrations)!.json)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.workflow as { name: string; nodes: { name: string; type: string; parameters: Record<string, unknown> }[]; connections: Record<string, { main: { node: string }[][] }> } & Record<string, unknown>
}
const node = (name: string, integrations?: (typeof ticket | typeof status)[]) => json(integrations).nodes.find((n) => n.name === name)!
const targets = (from: string) => json().connections[from].main.map((out) => out.map((l) => l.node))

describe('buildGatewayWorkflow', () => {
  it('builds the gateway from the POC data: names, webhook path and one Switch Action output per integration', () => {
    const w = json()
    expect(w.name).toBe('Xhealth AI Booking Gateway')
    expect(node('Webhook Trigger').parameters).toMatchObject({ httpMethod: 'POST', path: 'xhealth-gateway', responseMode: 'responseNode' })
    expect(node('Switch Action').parameters).toMatchObject({ dataType: 'string', value1: '={{ $json.action }}', rules: { rules: [{ value2: 'create_ticket', output: 0 }, { value2: 'get_status', output: 1 }] } })
    expect(targets('Switch Action')).toEqual([['Authenticate create_ticket'], ['Call get_status']])
  })

  it('validates every action with its own required fields, then routes valid payloads and answers invalid ones', () => {
    const code = String(node('Validate & Extract Payload').parameters.jsCode)
    expect(code).toContain('"create_ticket":{"required":["title"]')
    expect(code).toContain('"get_status":{"required":["ticket_id"]')
    expect(targets('Webhook Trigger')).toEqual([['Validate & Extract Payload']])
    expect(targets('Is Payload Valid?')).toEqual([['Switch Action'], ['Format Validation Error']])
    expect(targets('Format Validation Error')).toEqual([['Respond to Webhook']])
  })

  it('logs in first when the integration has an auth URL, calls the client API and formats the reply into one Respond to Webhook', () => {
    expect(targets('Authenticate create_ticket')).toEqual([['Call create_ticket']])
    expect(node('Authenticate create_ticket').parameters.url).toBe('https://da.example.com/api/login')
    expect(node('Call create_ticket').parameters).toMatchObject({ method: 'POST', url: 'https://da.example.com/api/tickets', sendHeaders: true, sendBody: true })
    expect(node('Call get_status').parameters).toMatchObject({ method: 'GET', sendQuery: true })
    expect(node('Call get_status').parameters).not.toHaveProperty('sendHeaders')
    expect(targets('Call create_ticket')).toEqual([['Format create_ticket Response']])
    expect(targets('Format get_status Response')).toEqual([['Respond to Webhook']])
  })

  it('is a complete export with layout, and one use case + cURL per integration on the gateway webhook', () => {
    const w = json()
    expect(w).toMatchObject({ settings: { executionOrder: 'v1' }, pinData: {}, active: false })
    expect(w.nodes.every((n) => 'position' in n && 'id' in n)).toBe(true)
    const { cases } = build()!
    expect(cases.map((c) => c.action)).toEqual(['create_ticket', 'get_status'])
    expect(cases[1].curl).toContain("'https://workflows.cekat.ai/webhook/xhealth-gateway'")
    expect(cases[1].curl).toContain('"action": "get_status"')
    expect(casesFromWorkflow(w).map((c) => c.action)).toEqual(['create_ticket', 'get_status'])
  })

  it('never puts the Cekat API key into the workflow', () => {
    expect(build()!.json).not.toContain('super-secret-token')
  })

  it('falls back to a client-based webhook path, skips unnamed integrations and needs at least one', () => {
    expect(node('Webhook Trigger', [{ ...status }]).parameters.path).toBe('xhealth-gateway')
    expect(build([{ ...status, name: '' }, status])!.cases).toHaveLength(1)
    expect(build([])).toBeNull()
  })
})
