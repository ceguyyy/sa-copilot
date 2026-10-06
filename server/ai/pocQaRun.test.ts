import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')

const sent: string[] = []
const saved: unknown[] = []
const replies: Record<string, string[]> = { 'Cek INV-9': ['Pesanan INV-9 dikirim'], Halo: ['Hai kak'], diam: [] }

vi.mock('../qa/livechat.ts', () => ({
  launchBrowser: async () => ({ newContext: async () => ({ newPage: async () => ({}), close: async () => {} }), close: async () => {} }),
  openLivechat: async () => {},
  lockToLivechat: async () => {},
  startChat: async () => {},
  sendAndWait: async (_page: unknown, text: string) => {
    sent.push(text)
    if (text === 'stop-here') stopQa()
    return replies[text] ?? ['ok']
  },
}))
vi.mock('./structured.ts', async (orig) => ({
  ...(await orig<typeof import('./structured.ts')>()),
  runStructured: async ({ resultName }: { resultName: string }) => ({
    data: resultName === 'QA verdicts' ? { steps: [{ verdict: 'pass', reason: 'sesuai' }, { verdict: 'fail', reason: 'salah' }] } : { summary: 'Ringkasan', revisionPrompt: 'Perbaiki' },
  }),
}))
vi.mock('../db.ts', () => ({
  queryOne: async (sql: string, params: unknown[]) => {
    if (sql.startsWith('select config')) return { config: {} }
    saved.push(params[1])
    return { id: 'run-1', poc_id: params[0], report: params[1], created_at: 'now' }
  },
}))

const { runQa, stopQa } = await import('./pocQaRun.ts')

const caseOf = (title: string, messages: string[]) => ({
  title,
  goal: '',
  contact: { Name: 'QA' },
  variables: [{ key: 'order', label: 'Order', dummy: 'INV-9', value: '' }],
  steps: messages.map((message) => ({ message, expectedAi: 'x', expectedAction: '' })),
})

describe('runQa', () => {
  beforeEach(() => {
    sent.length = 0
    saved.length = 0
  })

  it('plays every case with the data filled in, stops a case when the agent goes silent, judges and saves the report', async () => {
    const events: { type: string }[] = []
    await runQa(
      {
        pocId: '00000000-0000-4000-8000-000000000001',
        livechatUrl: 'https://live.cekat.ai/?chat=x',
        cases: [caseOf('Lacak', ['Halo', 'Cek {{order}}']), caseOf('Diam', ['diam', 'tidak terkirim'])],
        headless: true,
        adaptive: false,
      },
      { send: (e) => events.push(e as { type: string }) },
    )
    expect(sent).toEqual(['Halo', 'Cek INV-9', 'diam'])
    const report = saved[0] as { cases: { steps: { verdict: string }[] }[]; summary: string; revisionPrompt: string }
    expect(report.cases.map((c) => c.steps.map((s) => s.verdict))).toEqual([['pass', 'fail'], ['no_reply']])
    expect(report.summary).toBe('Ringkasan')
    expect(events.filter((e) => e.type === 'step')).toHaveLength(3)
    expect(events.at(-2)).toMatchObject({ type: 'result', data: { id: 'run-1' } })
  })

  it('stops between steps when the SA presses Stop, and still saves what ran', async () => {
    const base = { pocId: '00000000-0000-4000-8000-000000000001', livechatUrl: 'https://live.cekat.ai/?chat=x', headless: true, adaptive: false }
    await runQa({ ...base, cases: [caseOf('A', ['Halo', 'stop-here', 'tidak terkirim']), caseOf('B', ['tidak dimulai'])] }, { send: () => {} })
    expect(sent).toEqual(['Halo', 'stop-here'])
    const report = saved[0] as { cases: { title: string; error: string }[] }
    expect(report.cases.map((c) => [c.title, c.error])).toEqual([['A', 'Stopped by the SA']])
    expect(stopQa()).toBe(false) // nothing running any more
  })

  it('refuses links that are not a Cekat livechat', async () => {
    await expect(runQa({ pocId: '00000000-0000-4000-8000-000000000001', livechatUrl: 'https://example.com', cases: [caseOf('A', ['Halo'])] }, { send: () => {} })).rejects.toThrow(/live\.cekat\.ai/)
  })
})
