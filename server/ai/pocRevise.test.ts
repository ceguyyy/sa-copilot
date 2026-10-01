import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
const { HttpError } = await import('../http.ts')
const { pocConfig } = await import('../validation.ts')
const { revisePlan, validateRevision } = await import('./pocRevise.ts')

const current = () =>
  pocConfig.parse({
    agentBehavior: '# Agata\nRamah',
    knowledgeBase: { qna: [{ question: 'Parkir?', answer: 'Ada' }], files: [{ name: 'harga.pdf', size: 10 }] },
    apiIntegrations: [{ name: 'cek_jadwal', httpMethod: 'POST', description: 'Cek slot', apiKey: 'super-secret', webhookAddress: 'https://custom/hook' }],
    crm: {
      boards: [{ name: 'Leads', description: '', columns: [{ key: 'c1', name: 'Lead', type: 'text', options: [] }], rows: [{ c1: 'Budi' }], kanbanColumn: '' }],
    },
  })

describe('revisePlan — fields', () => {
  it('shows the current text and the item it belongs to, and returns the revised text', () => {
    const plan = revisePlan({ kind: 'field', field: 'qnaAnswer', index: 0 }, current(), 'POC 01', 'Xhealth')
    const task = plan.task.join('\n')
    expect(task).toContain('Ada')
    expect(task).toContain('Parkir?')
    expect(plan.apply({ text: 'Ada, gratis 2 jam' })).toEqual({ kind: 'field', text: 'Ada, gratis 2 jam' })
  })

  it('rejects a field whose item no longer exists', () => {
    expect(() => revisePlan({ kind: 'field', field: 'qnaAnswer', index: 4 }, current(), 'POC 01', 'Xhealth')).toThrow(HttpError)
  })
})

describe('revisePlan — sections', () => {
  it('never shows API keys to the model and keeps them on the revised integrations', () => {
    const plan = revisePlan({ kind: 'section', section: 'apiIntegrations' }, current(), 'POC 01', 'Xhealth')
    expect(plan.task.join('\n')).not.toContain('super-secret')
    const result = plan.apply({ apiIntegrations: [{ name: 'cek_jadwal', httpMethod: 'POST', description: 'Cek slot dokter', aiInputJson: '{}', targetMethod: 'GET', targetUrl: '', authUrl: '' }] })
    expect(result).toMatchObject({ kind: 'section', patch: { apiIntegrations: [{ apiKey: 'super-secret', webhookAddress: 'https://custom/hook', description: 'Cek slot dokter' }] } })
  })

  it('keeps uploaded knowledge base files', () => {
    const plan = revisePlan({ kind: 'section', section: 'knowledgeBase' }, current(), 'POC 01', 'Xhealth')
    const result = plan.apply({ knowledgeBase: { textSections: [], websites: [], qna: [{ question: 'Parkir?', answer: 'Ada' }] } })
    expect(result).toMatchObject({ kind: 'section', patch: { knowledgeBase: { files: [{ name: 'harga.pdf', size: 10 }] } } })
  })

  it('shows the CRM in the AI shape and maps the revised boards back', () => {
    const plan = revisePlan({ kind: 'section', section: 'crm' }, current(), 'POC 01', 'Xhealth')
    expect(plan.task.join('\n')).toContain('"values"')
    const result = plan.apply({ crm: { boards: [{ name: 'Leads', description: 'x', columns: [{ name: 'Lead', type: 'text', options: [] }], kanbanColumn: '', rows: [] }] } })
    expect(result).toMatchObject({ kind: 'section', patch: { crm: { boards: [{ name: 'Leads', columns: [{ key: 'c1', name: 'Lead' }] }] } } })
  })

  it('patches only the agent fields for the agent section', () => {
    const plan = revisePlan({ kind: 'section', section: 'agent' }, current(), 'POC 01', 'Xhealth')
    const result = plan.apply({ agentBehavior: 'B', welcomeMessage: 'W', agentTransferConditions: 'T', stopAiAfterHandoff: true, silentAgentHandoff: false })
    expect(result).toEqual({ kind: 'section', patch: { agentBehavior: 'B', welcomeMessage: 'W', agentTransferConditions: 'T', stopAiAfterHandoff: true, silentAgentHandoff: false } })
  })
})

describe('validateRevision', () => {
  it('accepts a revision that keeps the POC valid', () => {
    expect(() => validateRevision(current(), { kind: 'field', field: 'welcomeMessage' }, { kind: 'field', text: 'Halo' })).not.toThrow()
  })

  it('rejects a revision that breaks the POC limits', () => {
    expect(() => validateRevision(current(), { kind: 'field', field: 'welcomeMessage' }, { kind: 'field', text: 'x'.repeat(6000) })).toThrow(HttpError)
  })
})
