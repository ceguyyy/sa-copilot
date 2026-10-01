import { describe, expect, it } from 'vitest'
import { pocConfig } from '../validation.ts'
import { POC_LABEL_MAX_CHARS } from '../../shared/pocLimits.ts'
import { apiIntegrationsForAi, apiIntegrationsFromAi, knowledgeBaseFromAi, labelsFromAi, pipelineFromAi, toPocConfig } from './pocMapping.ts'

const empty = () => pocConfig.parse({})

describe('toPocConfig', () => {
  it('maps a full AI draft onto a valid POC config', () => {
    const cfg = toPocConfig(
      {
        agentBehavior: '# Agata',
        welcomeMessage: 'Halo!',
        agentTransferConditions: 'Darurat',
        stopAiAfterHandoff: true,
        silentAgentHandoff: false,
        labels: [{ name: 'Booking', condition: 'Pasien booking' }],
        pipeline: [
          { status: 'New Lead', condition: 'ignored for first' },
          { status: 'Booked', condition: 'Sudah booking' },
        ],
        knowledgeBase: { textSections: [{ title: 'Jam', content: '09-17' }], websites: [{ url: 'https://x.health', note: '' }], qna: [] },
        apiIntegrations: [{ name: 'cek_jadwal', httpMethod: 'POST', description: 'Cek slot', aiInputJson: '{"type":"object","properties":{"date":{"type":"string"}}}', targetMethod: 'GET', targetUrl: 'https://da.example.com/appointments/v2', authUrl: 'https://da.example.com/login' }],
        crm: {
          boards: [
            {
              name: 'Booking',
              description: 'Janji temu',
              columns: [
                { name: 'Pasien', type: 'text', options: [] },
                { name: 'Status', type: 'select', options: [{ label: 'Baru', condition: 'x' }, { label: 'Terkonfirmasi', condition: 'Slot dipilih' }] },
              ],
              kanbanColumn: 'Status',
              rows: [{ values: ['Aisyah', 'Baru'] }],
            },
          ],
        },
        additionalSettings: { aiHistoryLimit: 30, aiContextLimit: 10, aiTemperature: 'low', messageAwait: 5 },
      },
      empty(),
      'Xhealth',
    )
    expect(cfg.pipeline).toEqual([
      { order: 1, status: 'New Lead', condition: '' },
      { order: 2, status: 'Booked', condition: 'Sudah booking' },
    ])
    expect(cfg.apiIntegrations[0]).toMatchObject({
      aiInput: { properties: { date: { type: 'string' } } },
      webhookAddress: 'https://workflows.cekat.ai/webhook/xhealth-cek_jadwal',
      targetMethod: 'GET',
      targetUrl: 'https://da.example.com/appointments/v2',
      authUrl: 'https://da.example.com/login',
    })
    expect(cfg.crm.boards[0]).toMatchObject({ name: 'Booking', kanbanColumn: 'c2', rows: [{ c1: 'Aisyah', c2: 'Baru' }] })
    expect(cfg.crm.boards[0].columns[1].options).toEqual([
      { label: 'Baru', condition: '' },
      { label: 'Terkonfirmasi', condition: 'Slot dipilih' },
    ])
    expect(cfg.additionalSettings.aiHistoryLimit).toBe(30)
    expect(cfg.additionalSettings.timezone).toContain('Jakarta')
  })

  it('sanitizes invalid API names, URLs and aiInput JSON instead of failing', () => {
    const cfg = toPocConfig(
      {
        knowledgeBase: { websites: [{ url: 'not a url' }] },
        apiIntegrations: [{ name: 'Cek Jadwal-Dokter!', httpMethod: 'POST', targetUrl: 'ftp://x', aiInputJson: '{broken' }],
      },
      empty(),
      'Xhealth',
    )
    expect(cfg.knowledgeBase.websites).toEqual([])
    expect(cfg.apiIntegrations[0]).toMatchObject({ name: 'cek_jadwal_dokter_', targetUrl: '', targetMethod: 'GET', aiInput: { type: 'object' } })
  })

  it('keeps uploaded files, welcome image and API keys from the current POC', () => {
    const current = pocConfig.parse({
      welcomeImage: 'https://img/x.png',
      knowledgeBase: { files: [{ name: 'price.pdf', size: 10 }] },
      apiIntegrations: [{ name: 'cek_jadwal', httpMethod: 'GET', apiKey: 'secret' }],
    })
    const cfg = toPocConfig({ apiIntegrations: [{ name: 'cek_jadwal', httpMethod: 'GET' }] }, current, 'Xhealth')
    expect(cfg.welcomeImage).toBe('https://img/x.png')
    expect(cfg.knowledgeBase.files).toEqual([{ name: 'price.pdf', size: 10 }])
    expect(cfg.apiIntegrations[0].apiKey).toBe('secret')
  })

  it('maps the flowchart and happy cases', () => {
    const cfg = toPocConfig(
      { flowchart: '```mermaid\nflowchart TD\nA-->B\n```', happyCases: [{ title: 'Booking', goal: 'Booked', steps: [{ user: 'Halo', ai: 'Sapa', action: '' }] }] },
      empty(),
      'Xhealth',
    )
    expect(cfg.flow).toEqual({ mermaid: 'flowchart TD\nA-->B', happyCases: [{ title: 'Booking', goal: 'Booked', steps: [{ user: 'Halo', ai: 'Sapa', action: '' }] }] })
  })
})

describe('section mappers', () => {
  it('keeps the API key and a custom webhook address of an integration with the same name', () => {
    const current = pocConfig.parse({
      apiIntegrations: [{ name: 'cek_jadwal', httpMethod: 'GET', apiKey: 'secret', webhookAddress: 'https://custom.example/hook' }],
    }).apiIntegrations
    const next = apiIntegrationsFromAi([{ name: 'cek_jadwal', httpMethod: 'POST' }, { name: 'buat_booking', httpMethod: 'POST' }], current, 'Xhealth')
    expect(next[0]).toMatchObject({ apiKey: 'secret', webhookAddress: 'https://custom.example/hook' })
    expect(next[1]).toMatchObject({ apiKey: '', webhookAddress: 'https://workflows.cekat.ai/webhook/xhealth-buat_booking' })
  })

  it('shows integrations to the model without API keys and with the input schema as JSON text', () => {
    const current = pocConfig.parse({ apiIntegrations: [{ name: 'cek_jadwal', httpMethod: 'GET', apiKey: 'secret', aiInput: { type: 'object' } }] }).apiIntegrations
    const shown = apiIntegrationsForAi(current)
    expect(shown[0]).not.toHaveProperty('apiKey')
    expect(shown[0]).not.toHaveProperty('webhookAddress')
    expect(shown[0].aiInputJson).toBe('{"type":"object"}')
  })

  it('maps knowledge base, labels and pipeline sections, keeping uploaded files', () => {
    const kb = knowledgeBaseFromAi({ textSections: [{ title: 'Jam', content: '09-17' }], websites: [{ url: 'bad' }], qna: [{ question: 'Parkir?', answer: 'Ada' }] }, [{ name: 'a.pdf', size: 1 }])
    expect(kb).toEqual({ textSections: [{ title: 'Jam', content: '09-17' }], websites: [], qna: [{ question: 'Parkir?', answer: 'Ada' }], files: [{ name: 'a.pdf', size: 1 }] })
    expect(labelsFromAi([{ name: 'Booking', condition: 'x' }, 'junk'])).toEqual([{ name: 'Booking', condition: 'x' }])
    const long = 'x'.repeat(POC_LABEL_MAX_CHARS + 50)
    expect(labelsFromAi([{ name: long, condition: long }])).toEqual([{ name: 'x'.repeat(POC_LABEL_MAX_CHARS), condition: 'x'.repeat(POC_LABEL_MAX_CHARS) }])
    expect(pipelineFromAi([{ status: 'Baru', condition: 'y' }, { status: 'Booked', condition: 'z' }])).toEqual([
      { order: 1, status: 'Baru', condition: '' },
      { order: 2, status: 'Booked', condition: 'z' },
    ])
  })
})

describe('pocConfig flow', () => {
  it('defaults to an empty flow for POCs saved before it existed', () => {
    expect(empty().flow).toEqual({ mermaid: '', happyCases: [] })
  })
})

describe('pocConfig n8n workflows', () => {
  it('defaults to no workflows and keeps saved ones', () => {
    expect(empty().n8n).toEqual({ workflows: [] })
    const wf = {
      name: 'Gateway',
      description: '',
      json: '{"nodes":[],"connections":{}}',
      cases: [{ action: 'buat_tiket', title: 'Buat tiket', curl: "curl -X POST 'https://x'" }],
      testNotes: '',
    }
    expect(pocConfig.parse({ n8n: { workflows: [wf] } }).n8n.workflows).toEqual([wf])
  })
})
