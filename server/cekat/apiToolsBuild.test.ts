import { describe, expect, it } from 'vitest'
import { planApiTools, runApiToolsBuild, schemaOf } from './apiToolsBuild.ts'
import type { ApiToolSpec, ApiToolsUi } from './apiToolsUi.ts'

const schema = { type: 'object', properties: { tanggal: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['tanggal'] }
const config = {
  apiIntegrations: [
    { name: 'cek_jadwal', description: 'Cek slot dokter', httpMethod: 'GET', webhookAddress: 'https://workflows.example/webhook/cek-jadwal', apiKey: 'k-1', aiInput: schema },
    { name: 'buat_booking', description: 'Buat booking', httpMethod: 'PUT', webhookAddress: 'https://workflows.example/webhook/booking', aiInput: {} },
    { name: 'tanpa_webhook', webhookAddress: '' },
    { name: 'Bad Name', webhookAddress: 'https://x.example' },
    { name: '' },
  ],
}

function fakeUi(existing: string[] = [], { activates = true } = {}) {
  const created: ApiToolSpec[] = []
  const active = new Set<string>()
  const ui: ApiToolsUi = {
    names: async () => new Set(existing),
    create: async (tool) => (created.push(tool), `id-${tool.name}`),
    activate: async (_agent, name) => void (activates && active.add(name)),
    isActive: async (_agent, name) => active.has(name),
  }
  return { ui, created }
}

describe('schemaOf', () => {
  it('keeps the POC schema and gives an empty one when there is none', () => {
    expect(schemaOf(schema)).toEqual(schema)
    expect(schemaOf({})).toEqual({ type: 'object', properties: {} })
    expect(schemaOf('x')).toEqual({ type: 'object', properties: {} })
  })
})

describe('planApiTools', () => {
  it('keeps tools with a valid name and webhook address, and says why others are skipped', () => {
    const plan = planApiTools(config)
    expect(plan.tools.map((t) => [t.name, t.method])).toEqual([
      ['cek_jadwal', 'GET'],
      ['buat_booking', 'POST'],
    ])
    expect(plan.tools[0]).toMatchObject({ apiKey: 'k-1', webhookAddress: 'https://workflows.example/webhook/cek-jadwal', schema })
    expect(plan.problems).toEqual([
      expect.stringContaining('"buat_booking": Cekat tools only call GET or POST'),
      expect.stringContaining('"tanpa_webhook" is skipped'),
      expect.stringContaining('"Bad Name" is skipped'),
    ])
  })
})

describe('runApiToolsBuild', () => {
  it('creates each tool and activates it on the agent', async () => {
    const { ui, created } = fakeUi()
    const result = await runApiToolsBuild(ui, 'agent-1', config, () => {})
    expect(created.map((t) => t.name)).toEqual(['cek_jadwal', 'buat_booking'])
    expect(result.created).toEqual(['cek_jadwal', 'buat_booking'])
    expect(result.activated).toEqual(['cek_jadwal', 'buat_booking'])
  })

  it('leaves tools whose name already exists alone', async () => {
    const { ui, created } = fakeUi(['cek_jadwal'])
    const result = await runApiToolsBuild(ui, 'agent-1', config, () => {})
    expect(created.map((t) => t.name)).toEqual(['buat_booking'])
    expect(result.problems).toEqual(expect.arrayContaining([expect.stringContaining('"cek_jadwal" already exists')]))
  })

  it('reports a tool that did not become active', async () => {
    const { ui } = fakeUi([], { activates: false })
    const result = await runApiToolsBuild(ui, 'agent-1', config, () => {})
    expect(result.activated).toEqual([])
    expect(result.problems).toEqual(expect.arrayContaining([expect.stringContaining('"cek_jadwal" was created but is not active')]))
  })

  it('does nothing without API integrations', async () => {
    const { ui, created } = fakeUi()
    expect(await runApiToolsBuild(ui, 'agent-1', {}, () => {})).toEqual({ created: [], activated: [], problems: [] })
    expect(created).toEqual([])
  })
})
