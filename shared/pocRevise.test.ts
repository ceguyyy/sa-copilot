import { describe, expect, it } from 'vitest'
import { fieldText, isSameTarget, reviseTargetLabel, withFieldText, type PocReviseTarget } from './pocRevise.ts'

const config = () => ({
  agentBehavior: '# Agata',
  welcomeMessage: 'Halo!',
  agentTransferConditions: 'Darurat',
  knowledgeBase: {
    textSections: [{ title: 'Jam buka', content: '09-17' }],
    qna: [{ question: 'Parkir?', answer: 'Ada' }],
  },
  apiIntegrations: [{ name: 'cek_jadwal', description: 'Cek slot' }],
})

describe('fieldText', () => {
  it('reads top-level and per-item fields', () => {
    expect(fieldText(config(), { kind: 'field', field: 'agentBehavior' })).toBe('# Agata')
    expect(fieldText(config(), { kind: 'field', field: 'kbTextContent', index: 0 })).toBe('09-17')
    expect(fieldText(config(), { kind: 'field', field: 'qnaAnswer', index: 0 })).toBe('Ada')
    expect(fieldText(config(), { kind: 'field', field: 'apiDescription', index: 0 })).toBe('Cek slot')
  })

  it('returns an empty string for a missing item', () => {
    expect(fieldText(config(), { kind: 'field', field: 'qnaAnswer', index: 5 })).toBe('')
  })
})

describe('withFieldText', () => {
  it('returns a new config with only the target field changed', () => {
    const before = config()
    const after = withFieldText(before, { kind: 'field', field: 'qnaAnswer', index: 0 }, 'Ada, gratis')
    expect(after.knowledgeBase.qna[0]).toEqual({ question: 'Parkir?', answer: 'Ada, gratis' })
    expect(after.knowledgeBase.textSections).toBe(before.knowledgeBase.textSections)
    expect(before.knowledgeBase.qna[0].answer).toBe('Ada')
  })

  it('sets top-level text fields and API descriptions', () => {
    expect(withFieldText(config(), { kind: 'field', field: 'welcomeMessage' }, 'Hai').welcomeMessage).toBe('Hai')
    expect(withFieldText(config(), { kind: 'field', field: 'apiDescription', index: 0 }, 'Baru').apiIntegrations[0]).toEqual({ name: 'cek_jadwal', description: 'Baru' })
  })

  it('leaves the config unchanged when the item no longer exists', () => {
    const before = config()
    expect(withFieldText(before, { kind: 'field', field: 'kbTextContent', index: 3 }, 'x')).toEqual(before)
  })
})

describe('reviseTargetLabel', () => {
  it('names sections and fields, with the item they belong to', () => {
    expect(reviseTargetLabel(config(), { kind: 'section', section: 'labels' })).toBe('AI Action — Labels')
    expect(reviseTargetLabel(config(), { kind: 'field', field: 'agentBehavior' })).toBe('AI Agent Behavior')
    expect(reviseTargetLabel(config(), { kind: 'field', field: 'qnaAnswer', index: 0 })).toBe('Q&A answer — "Parkir?"')
    expect(reviseTargetLabel(config(), { kind: 'field', field: 'apiDescription', index: 0 })).toBe('API description — cek_jadwal')
  })
})

describe('isSameTarget', () => {
  it('compares kind, id and index', () => {
    const a: PocReviseTarget = { kind: 'field', field: 'qnaAnswer', index: 1 }
    expect(isSameTarget(a, { kind: 'field', field: 'qnaAnswer', index: 1 })).toBe(true)
    expect(isSameTarget(a, { kind: 'field', field: 'qnaAnswer', index: 2 })).toBe(false)
    expect(isSameTarget({ kind: 'section', section: 'crm' }, { kind: 'section', section: 'crm' })).toBe(true)
    expect(isSameTarget({ kind: 'section', section: 'crm' }, a)).toBe(false)
    expect(isSameTarget(null, a)).toBe(false)
  })
})
