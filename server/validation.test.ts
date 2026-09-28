import { describe, expect, test } from 'vitest'
import { HttpError } from './http.ts'
import { pocInput, pocPatch, projectInput, skillInput, skillPatch, sourceUploadFields, toSetClause } from './validation.ts'

describe('skill schemas', () => {
  test('create fills defaults for description and is_default', () => {
    const skill = skillInput.parse({ name: 'SOW', output_type: 'sow_cekat', instructions: 'Write it' })
    expect(skill).toMatchObject({ description: '', is_default: false })
  })

  test('patch never injects defaults, so unrelated columns are left untouched', () => {
    expect(skillPatch.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
  })

  test('rejects an unknown output type', () => {
    expect(() => skillInput.parse({ name: 'x', output_type: 'poem', instructions: 'y' })).toThrow()
  })
})

describe('projectInput', () => {
  test('treats a blank language as not chosen so the main language is used', () => {
    expect(projectInput.parse({ name: 'Deal', client_name: 'ACME', language: '' }).language).toBeUndefined()
    expect(projectInput.parse({ name: 'Deal', client_name: 'ACME', language: '  ' }).language).toBeUndefined()
    expect(projectInput.parse({ name: 'Deal', client_name: 'ACME', language: 'Bahasa Indonesia' }).language).toBe('Bahasa Indonesia')
  })

  test('strips columns the client must not write', () => {
    const parsed = projectInput.parse({ name: 'Deal', client_name: 'ACME', id: 'evil', created_at: 'x' })
    expect(parsed).not.toHaveProperty('id')
    expect(parsed).not.toHaveProperty('created_at')
  })

  test('rejects a blank name', () => {
    expect(() => projectInput.parse({ name: '   ', client_name: 'ACME' })).toThrow()
  })
})

describe('sourceUploadFields', () => {
  test('rejects a projectId that is not a uuid', () => {
    expect(() => sourceUploadFields.parse({ projectId: '1 or 1=1', kind: 'knowledge', extractedText: '' })).toThrow()
  })
})

describe('poc schemas', () => {
  test('accepts a valid POC payload with nested configuration', () => {
    const parsed = pocInput.parse({
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'AI Booking',
      config: {
        agentBehavior: 'Be helpful',
        welcomeMessage: 'Hello',
        labels: [{ name: 'Booking', condition: 'User asked to book' }],
      },
    })
    expect(parsed.name).toBe('AI Booking')
    expect(parsed.config.labels).toHaveLength(1)
  })

  test('accepts a blank website URL when the user is still drafting a new POC', () => {
    const parsed = pocInput.parse({
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'AI Booking',
      config: {
        agentBehavior: 'Be helpful',
        welcomeMessage: 'Hello',
        knowledgeBase: {
          textSections: [],
          websites: [{ url: '', note: 'draft' }],
          qna: [],
          files: [],
        },
        apiIntegrations: [],
      },
    })
    expect(parsed.config.knowledgeBase.websites[0].url).toBe('')
  })

  test('accepts partial nested config in a patch, including AI-generated field updates', () => {
    expect(pocPatch.parse({
      config: {
        knowledgeBase: { qna: [{ question: 'What is the SLA?', answer: '24 hours' }] },
        labels: [{ name: 'Urgent' }],
      },
    })).toMatchObject({
      config: {
        knowledgeBase: { qna: [{ question: 'What is the SLA?', answer: '24 hours' }] },
        labels: [{ name: 'Urgent' }],
      },
    })
  })

  test('accepts blank draft rows while the user is still filling a POC form', () => {
    const parsed = pocInput.parse({
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Draft POC',
      config: {
        agentBehavior: '',
        welcomeMessage: '',
        labels: [{ name: '', condition: '' }],
        pipeline: [{ order: 1, status: '', condition: '' }],
        knowledgeBase: {
          textSections: [{ title: '', content: '' }],
          websites: [{ url: '', note: '' }],
          qna: [{ question: '', answer: '' }],
          files: [{ name: '', size: 0 }],
        },
        apiIntegrations: [{ name: '', httpMethod: 'POST', description: '', webhookAddress: '', aiInput: {} }],
      },
    })

    expect(parsed.config.labels[0].name).toBe('')
    expect(parsed.config.pipeline[0].status).toBe('')
    expect(parsed.config.knowledgeBase.websites[0].url).toBe('')
    expect(parsed.config.apiIntegrations[0].name).toBe('')
  })

  test('patch ignores undefined values and rejects invalid names', () => {
    expect(pocPatch.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
    expect(() => pocPatch.parse({ name: '   ' })).toThrow()
  })
})

describe('toSetClause', () => {
  test('numbers placeholders from the given index and skips undefined values', () => {
    expect(toSetClause({ name: 'A', industry: undefined, status: 'won' }, 2)).toEqual({
      sql: '"name" = $2, "status" = $3',
      values: ['A', 'won'],
    })
  })

  test('an empty patch is a 400, not a broken UPDATE', () => {
    expect(() => toSetClause({})).toThrow(HttpError)
  })
})
