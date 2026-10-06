import { describe, expect, test } from 'vitest'
import { sanitizePocExport } from './pocExport'

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
})
