import { describe, expect, test } from 'vitest'
import { buildN8nWorkflow, sanitizePocExport } from './pocExport'

const sampleConfig = {
  agentBehavior: 'Be concise',
  welcomeMessage: 'Hello there',
  welcomeImage: null,
  agentTransferConditions: 'User asks to speak to an agent',
  stopAiAfterHandoff: true,
  silentAgentHandoff: false,
  labels: [{ name: 'VIP', condition: 'customer tier is VIP' }],
  pipeline: [{ order: 1, status: 'New', condition: '' }, { order: 2, status: 'Qualified', condition: 'Customer confirms intent' }],
  knowledgeBase: {
    textSections: [{ title: 'Hours', content: 'Open 9-5' }],
    websites: [{ url: 'https://example.com/help', note: 'FAQ' }],
    qna: [{ question: 'Where is the office?', answer: 'Downtown' }],
    files: [{ name: 'brief.pdf', size: 1000 }],
  },
  apiIntegrations: [{
    name: 'create_ticket',
    httpMethod: 'POST',
    description: 'Create a support ticket when the user requests escalation.',
    webhookAddress: 'https://workflows.cekat.ai/webhook/xhealth-create_ticket',
    apiKey: 'super-secret-token',
    aiInput: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false },
    targetMethod: 'POST',
    targetUrl: 'https://da.example.com/api/tickets',
    authUrl: 'https://da.example.com/api/login',
  }],
  additionalSettings: {
    aiHistoryLimit: 20,
    aiReadFileLimit: 3,
    aiContextLimit: 10,
    aiTemperature: 'balanced',
    messageAwait: 5,
    aiMessageLimit: 1000,
    watcher: 'off',
    timezone: '(GMT+7:00) Bangkok, Hanoi, Jakarta',
    sessionOnlyMemory: 'off',
    ignoreTeamHandoff: false,
  },
} as const

describe('poc export utilities', () => {
  test('removes secret keys from export payloads while keeping the webhook URL', () => {
    const clean = sanitizePocExport('AI Booking', sampleConfig)
    expect(clean.apiIntegrations[0]).not.toHaveProperty('apiKey')
    expect(clean.apiIntegrations[0].webhookAddress).toBe('https://workflows.cekat.ai/webhook/xhealth-create_ticket')
  })

  test('builds Cekat webhook → validate → login → client API → respond, linked by node name', () => {
    const workflow = buildN8nWorkflow('Xhealth', 'AI Booking', sampleConfig.apiIntegrations[0])
    expect(workflow.nodes.map((n) => n.name)).toEqual(['Cekat webhook', 'Validate AI Input', 'Authenticate', 'Call client API', 'Respond to Cekat'])
    expect(workflow.nodes[0].parameters).toMatchObject({ path: 'xhealth-create_ticket', httpMethod: 'POST', responseMode: 'responseNode' })
    expect(workflow.nodes[1].parameters.jsCode).toContain('"required":["title"]')
    expect(workflow.nodes[2].parameters.url).toBe('https://da.example.com/api/login')
    expect(workflow.nodes[3].parameters).toMatchObject({ method: 'POST', url: 'https://da.example.com/api/tickets', sendHeaders: true, sendBody: true })
    expect(workflow.connections['Cekat webhook'].main[0][0].node).toBe('Validate AI Input')
    expect(workflow.connections['Authenticate'].main[0][0].node).toBe('Call client API')
    expect(workflow.connections['Call client API'].main[0][0].node).toBe('Respond to Cekat')
  })

  test('skips the login node and sends GET input as query when there is no auth URL', () => {
    const workflow = buildN8nWorkflow('Xhealth', 'AI Booking', { ...sampleConfig.apiIntegrations[0], authUrl: '', targetMethod: 'GET', webhookAddress: '' })
    expect(workflow.nodes.map((n) => n.name)).not.toContain('Authenticate')
    expect(workflow.nodes[0].parameters.path).toBe('xhealth-create_ticket')
    expect(workflow.nodes[2].parameters).toMatchObject({ method: 'GET', sendQuery: true })
    expect(workflow.nodes[2].parameters).not.toHaveProperty('sendHeaders')
  })

  test('never puts the Cekat API key into the n8n workflow', () => {
    const workflow = buildN8nWorkflow('Xhealth', 'AI Booking', sampleConfig.apiIntegrations[0])
    expect(JSON.stringify(workflow)).not.toContain('super-secret-token')
  })
})
