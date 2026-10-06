import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')

const existing = { title: 'Lama', goal: '', steps: [{ user: 'Halo', ai: 'Sapa', action: '' }] }
let knowledge: { name: string; extracted_text: string }[] = []
let context = 'CS haji'
const updates: unknown[][] = []

vi.mock('../db.ts', () => ({
  query: async () => knowledge,
  queryOne: async (sql: string, params: unknown[]) => {
    if (sql.startsWith('select id, name, context, cases')) return { id: params[0], name: 'S', context, cases: [existing] }
    updates.push(params)
    return { id: params[0], cases: JSON.parse(params[1] as string) }
  },
}))
vi.mock('./structured.ts', async (orig) => ({
  ...(await orig<typeof import('./structured.ts')>()),
  runStructured: async ({ system }: { system: string[] }) => ({
    data: { cases: [{ title: 'Baru', goal: 'Tahu biaya', steps: [{ user: 'Berapa biaya?', ai: system.join(' ').includes('Rp 50 juta') ? 'Rp 50 juta' : '?', action: '' }] }, { title: '', steps: [] }] },
  }),
}))

const { generateSuiteCases } = await import('./qaSuite.ts')
const suiteId = '00000000-0000-4000-8000-000000000001'
const result = async (body: Record<string, unknown>) => {
  const events: { type: string; data?: { cases: { title: string; steps: { ai: string }[] }[] } }[] = []
  await generateSuiteCases({ suiteId, ...body }, { send: (e) => events.push(e as (typeof events)[number]) })
  return events.find((e) => e.type === 'result')!.data!
}

describe('generateSuiteCases', () => {
  beforeEach(() => {
    knowledge = [{ name: 'FAQ', extracted_text: 'Biaya haji Rp 50 juta' }]
    context = 'CS haji'
    updates.length = 0
  })

  it('writes cases from the knowledge and appends them to the saved ones, dropping empty cases', async () => {
    const suite = await result({ count: 2 })
    expect(suite.cases.map((c) => c.title)).toEqual(['Lama', 'Baru'])
    expect(suite.cases[1].steps[0].ai).toBe('Rp 50 juta')
  })

  it('replaces the saved cases when asked', async () => {
    expect((await result({ mode: 'replace' })).cases.map((c) => c.title)).toEqual(['Baru'])
  })

  it('refuses when the suite has neither knowledge nor an agent description', async () => {
    knowledge = []
    context = ''
    await expect(generateSuiteCases({ suiteId }, { send: () => {} })).rejects.toThrow(/Add knowledge/)
    expect(updates).toEqual([])
  })
})
