import { describe, expect, it } from 'vitest'
import { pocConfig } from '../validation.ts'
import { toPocConfig } from './pocMapping.ts'

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
})
