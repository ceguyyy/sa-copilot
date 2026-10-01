import { describe, expect, it } from 'vitest'
import { pocChanges, pocSectionTexts } from './pocDiff.ts'

const base = {
  agentBehavior: '# Agata\nRamah',
  welcomeMessage: 'Halo!',
  welcomeImage: null,
  agentTransferConditions: 'Darurat',
  stopAiAfterHandoff: false,
  silentAgentHandoff: false,
  labels: [{ name: 'Booking', condition: 'Pasien booking' }],
  pipeline: [{ order: 1, status: 'New', condition: '' }],
  knowledgeBase: { textSections: [], websites: [], qna: [], files: [] },
  apiIntegrations: [{ name: 'cek_jadwal', httpMethod: 'POST', description: 'Cek slot', webhookAddress: 'https://w/x', apiKey: 'secret-1', aiInput: {}, targetMethod: 'GET', targetUrl: '', authUrl: '' }],
  crm: { boards: [] },
  flow: { mermaid: 'flowchart TD\nA-->B', happyCases: [] },
  additionalSettings: { aiHistoryLimit: 20 },
}

describe('pocChanges', () => {
  it('lists only the sections that differ, with before/after text', () => {
    const after = { ...base, labels: [...base.labels, { name: 'VIP', condition: 'Pasien VIP' }], flow: { ...base.flow, mermaid: 'flowchart TD\nA-->C' } }
    const changes = pocChanges(base, after)
    expect(changes.map((c) => c.label)).toEqual(['Labels', 'Flow & happy cases'])
    expect(changes[0].after).toContain('VIP -> Pasien VIP')
    expect(changes[0].before).not.toContain('VIP')
  })

  it('reports nothing for identical configs', () => {
    expect(pocChanges(base, structuredClone(base))).toEqual([])
  })

  it('tolerates versions saved before newer sections existed', () => {
    const legacy = { agentBehavior: '# Agata\nRamah', labels: [] }
    const changes = pocChanges(legacy, base)
    expect(changes.map((c) => c.key)).toContain('flow')
  })
})

describe('pocSectionTexts', () => {
  it('never shows API keys or embedded image data, only that they changed', () => {
    const image = `data:image/png;base64,${'A'.repeat(4000)}`
    const texts = pocSectionTexts({ ...base, welcomeImage: image })
    expect(texts.api).not.toContain('secret-1')
    expect(texts.api).toContain('apiKey: set')
    expect(texts.welcome).not.toContain('AAAA')
    expect(texts.welcome).toMatch(/Welcome image: embedded image \(3 KB, #\w+\)/)
    const other = pocSectionTexts({ ...base, welcomeImage: `data:image/png;base64,${'B'.repeat(4000)}` })
    expect(other.welcome).not.toBe(texts.welcome)
  })
})

describe('pocChanges n8n workflows', () => {
  it('shows edited n8n workflows as their own section', () => {
    const wf = { name: 'Buat tiket', tool: 'buat_tiket', description: '', json: '{}', curl: 'curl a', testNotes: '' }
    const changes = pocChanges({ ...base, n8n: { workflows: [wf] } }, { ...base, n8n: { workflows: [{ ...wf, curl: 'curl b' }] } })
    expect(changes.map((c) => c.label)).toEqual(['n8n workflows'])
    expect(changes[0].after).toContain('curl b')
  })

  it('shows the cURL of each use case under its action', () => {
    const wf = { name: 'Gateway', description: '', json: '{}', cases: [{ action: 'create_ticket', title: 'Create', curl: 'curl a' }], testNotes: '' }
    const edited = { ...wf, cases: [{ ...wf.cases[0], curl: 'curl b' }] }
    const changes = pocChanges({ ...base, n8n: { workflows: [wf] } }, { ...base, n8n: { workflows: [edited] } })
    expect(changes.map((c) => c.label)).toEqual(['n8n workflows'])
    expect(changes[0].after).toContain('### create_ticket — Create\ncurl b')
  })
})
