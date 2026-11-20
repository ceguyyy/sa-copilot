import { describe, expect, it, vi } from 'vitest'
vi.mock('./config.ts', () => ({ config: { port: 3000 } }))
vi.mock('./db.ts', () => ({ query: vi.fn() }))
vi.mock('./routes/cekatPush.ts', () => ({ cekatCall: vi.fn() }))
import { mergeAssertions, type SaResponse } from '../shared/saPostman.ts'
import { evaluateChecks } from './saPostmanExecution.ts'
import { mockFlowArgs } from './routes/saMock.ts'

const response = (body: unknown, status = 200): SaResponse => ({ status, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), durationMs: 1, bytes: 1, truncated: false })

describe('assertion operators', () => {
  const rules = (list: unknown[]) => JSON.stringify(list)

  it('checks that a field is not empty', () => {
    const script = rules([
      { name: 'slots', target: 'json', path: 'slots', operator: 'notEmpty' },
      { name: 'empty list', target: 'json', path: 'none', operator: 'notEmpty' },
      { name: 'blank text', target: 'json', path: 'note', operator: 'notEmpty' },
      { name: 'missing', target: 'json', path: 'missing', operator: 'notEmpty' },
      { name: 'zero', target: 'json', path: 'count', operator: 'notEmpty' },
    ])
    const checks = evaluateChecks(script, response({ slots: ['09:00'], none: [], note: ' ', count: 0 }))
    expect(checks.map((c) => c.passed)).toEqual([true, false, false, false, true])
    expect(checks[0].expected).toBe('not empty')
  })

  it('checks that text or a list contains a value', () => {
    const script = rules([
      { name: 'text', target: 'json', path: 'message', operator: 'contains', equals: 'berhasil' },
      { name: 'list', target: 'json', path: 'slots', operator: 'contains', equals: '10:00' },
      { name: 'header', target: 'header', path: 'content-type', operator: 'contains', equals: 'json' },
    ])
    expect(evaluateChecks(script, response({ message: 'Booking berhasil', slots: ['09:00'] })).map((c) => c.passed)).toEqual([true, false, true])
  })

  it('still needs an expected value for contains', () => {
    expect(() => evaluateChecks(rules([{ name: 'x', target: 'json', path: 'a', operator: 'contains' }]), response({}))).toThrow()
  })
})

describe('mergeAssertions', () => {
  const status = { name: 'Status 200', target: 'status' as const, operator: 'equals' as const, equals: 200 }
  it('adds new rules and skips ones already there', () => {
    const merged = JSON.parse(mergeAssertions(JSON.stringify([status]), [{ ...status, name: 'Again' }, { name: 'slots', target: 'json', path: 'slots', operator: 'notEmpty' }]))
    expect(merged.map((r: { name: string }) => r.name)).toEqual(['Status 200', 'slots'])
    expect(JSON.parse(mergeAssertions('', [status]))).toEqual([status])
  })
  it('refuses to touch a script that is not a JSON array', () => {
    expect(() => mergeAssertions('{"pre":1}', [status])).toThrow(/post-response JSON/)
  })
})

describe('mockFlowArgs', () => {
  type Step = { input: { responseType: string; fields: { status: number; body: unknown; headers: Record<string, string> } } }
  it('returns a JSON mock as JSON with its status', () => {
    const args = mockFlowArgs('Get slots', { status: 201, contentType: 'application/json', body: '{"slots":["09:00"]}' }) as { flowName: string; trigger: unknown; steps: Step[] }
    expect(args.flowName).toBe('[SA Copilot mock] Get slots')
    expect(args.trigger).toEqual({ pieceName: 'webhook', triggerName: 'catch_webhook', input: { authType: 'none' } })
    expect(args.steps[0].input).toMatchObject({ responseType: 'json', fields: { status: 201, body: { slots: ['09:00'] } } })
  })
  it('returns anything else as raw text with its content type', () => {
    const args = mockFlowArgs('Page', { status: 200, contentType: 'text/html', body: '<p>ok</p>' }) as { steps: Step[] }
    expect(args.steps[0].input).toMatchObject({ responseType: 'raw', fields: { body: '<p>ok</p>', headers: { 'content-type': 'text/html' } } })
  })
})
