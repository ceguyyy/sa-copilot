import { describe, expect, it, test } from 'vitest'
import { HttpError } from './http.ts'
import { pocConfig, pocInput, pocPatch, projectInput, skillInput, skillPatch, sourceScrape, sourceUploadFields, toSetClause } from './validation.ts'
import { POC_LABEL_MAX_CHARS } from '../shared/pocLimits.ts'

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

describe('sourceScrape', () => {
  test('accepts HTTP(S) URLs and rejects other protocols', () => {
    expect(sourceScrape.parse({ projectId: null, url: 'https://example.com' }).url).toBe('https://example.com')
    expect(() => sourceScrape.parse({ projectId: null, url: 'file:///etc/passwd' })).toThrow()
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

  test('n8n workflow keeps one cURL per use case', () => {
    const cases = [
      { action: 'create_ticket', title: 'Create a ticket', curl: 'curl -X POST x' },
      { action: 'get_ticket', curl: 'curl -X POST y' },
    ]
    const parsed = pocConfig.parse({ n8n: { workflows: [{ name: 'Gateway', json: '{}', cases }] } })
    expect(parsed.n8n.workflows[0]).toEqual({
      name: 'Gateway',
      description: '',
      json: '{}',
      cases: [cases[0], { ...cases[1], title: '' }],
      testNotes: '',
    })
    expect(pocConfig.parse({ n8n: { workflows: [{ name: 'Gateway', json: '{}' }] } }).n8n.workflows[0].cases).toEqual([])
  })

  test('POC Flow keeps the nested flow tree, and POCs saved before it get an empty list', () => {
    const flow = {
      id: 'f1',
      name: 'Inbound',
      start: {
        id: 'c',
        kind: 'conditions',
        branches: [
          {
            id: 'b',
            condition: { type: 'firstMessageText', text: 'PROMO' },
            next: {
              id: 'm',
              kind: 'buttons',
              message: 'Pilih',
              image: null,
              buttons: [{ id: 'k', label: 'Lacak pesanan', next: { id: 'e', kind: 'end', end: { type: 'ai', agent: 'Order Bot' } } }],
              elseId: 'me',
              elseNext: { id: 'a', kind: 'action', action: { type: 'jump', targetId: 'm' }, next: null },
            },
          },
        ],
        elseId: 'ce',
        elseNext: { id: 'h', kind: 'end', end: { type: 'human', agents: ['Sari'] } },
      },
    }
    expect(pocConfig.parse({ chatFlows: { flows: [flow] } }).chatFlows.flows[0]).toEqual(flow)
    expect(pocConfig.parse({}).chatFlows).toEqual({ flows: [] })
  })

  test('POC Flow rejects more than 10 buttons, a button over 20 characters and a message over 10000', () => {
    const buttons = (labels: string[]) => labels.map((label, i) => ({ id: `k${i}`, label, next: null }))
    const withStep = (step: Record<string, unknown>) => ({ chatFlows: { flows: [{ id: 'f', name: 'F', start: step }] } })
    const msg = (message: string, labels: string[]) => withStep({ id: 'm', kind: 'buttons', message, image: null, buttons: buttons(labels), elseId: 'e', elseNext: null })
    expect(() => pocConfig.parse(msg('Hi', Array.from({ length: 11 }, (_, i) => `B${i}`)))).toThrow()
    expect(() => pocConfig.parse(msg('Hi', ['x'.repeat(21)]))).toThrow()
    expect(() => pocConfig.parse(msg('x'.repeat(10_001), ['Ok']))).toThrow()
    expect(() => pocConfig.parse(msg('x'.repeat(10_000), ['x'.repeat(20)]))).not.toThrow()
  })

  test('POC Flow rejects repeated node ids, very deep trees and malformed times with a 400-style error', () => {
    const end = (id: string) => ({ id, kind: 'end', end: { type: 'ai', agent: 'Bot' } })
    const withStart = (start: unknown) => ({ chatFlows: { flows: [{ id: 'f', name: 'F', start }] } })
    const dup = { id: 'a', kind: 'action', action: { type: 'addLabel', label: 'x' }, next: end('a') }
    expect(() => pocConfig.parse(withStart(dup))).toThrow(/repeat/i)

    let deep: unknown = end('leaf')
    for (let i = 0; i < 5_000; i++) deep = { id: `a${i}`, kind: 'action', action: { type: 'addLabel', label: 'x' }, next: deep }
    expect(() => pocConfig.parse(withStart(deep))).toThrow(/too deep/i)

    const time = (from: string) => withStart({ id: 'c', kind: 'conditions', branches: [{ id: 'b', condition: { type: 'firstMessageTime', from, to: '17:00', days: ['Mon'] }, next: null }], elseId: 'e', elseNext: null })
    expect(() => pocConfig.parse(time('8am'))).toThrow()
    expect(() => pocConfig.parse(time(''))).not.toThrow()
    expect(() => pocConfig.parse(time('08:00'))).not.toThrow()
  })

  test('n8n workflow saved before use cases keeps its cURL as one use case', () => {
    const legacy = { name: 'Buat tiket', tool: 'buat_tiket', description: '', json: '{}', curl: 'curl x', testNotes: '' }
    expect(pocConfig.parse({ n8n: { workflows: [legacy] } }).n8n.workflows[0].cases).toEqual([{ action: 'buat_tiket', title: 'Buat tiket', curl: 'curl x' }])
  })

  test('label name and description accept up to 3000 characters and reject longer ones', () => {
    const atLimit = 'a'.repeat(POC_LABEL_MAX_CHARS)
    const tooLong = `${atLimit}a`
    expect(POC_LABEL_MAX_CHARS).toBe(3000)
    expect(pocConfig.parse({ labels: [{ name: atLimit, condition: atLimit }] }).labels[0]).toEqual({ name: atLimit, condition: atLimit })
    expect(() => pocConfig.parse({ labels: [{ name: tooLong, condition: '' }] })).toThrow()
    expect(() => pocConfig.parse({ labels: [{ name: 'Urgent', condition: tooLong }] })).toThrow()
    expect(() => pocPatch.parse({ config: { labels: [{ name: tooLong }] } })).toThrow()
    expect(() => pocPatch.parse({ config: { labels: [{ condition: tooLong }] } })).toThrow()
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

describe('pocConfig welcome image', () => {
  const png = `data:image/png;base64,${Buffer.alloc(3000).toString('base64')}`

  it('accepts an image picked from disk (embedded) as well as a link', () => {
    expect(pocConfig.parse({ welcomeImage: png }).welcomeImage).toBe(png)
    expect(pocConfig.parse({ welcomeImage: 'https://cdn.example.com/w.png' }).welcomeImage).toBe('https://cdn.example.com/w.png')
  })

  it('rejects embedded files that are not a supported image', () => {
    expect(() => pocConfig.parse({ welcomeImage: 'data:text/html;base64,PGgxPg==' })).toThrow(/Welcome image/)
  })
})
