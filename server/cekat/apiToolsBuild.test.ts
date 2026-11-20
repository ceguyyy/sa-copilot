import { describe, expect, it, vi } from 'vitest'
import { planApiTools, runApiToolsBuild, schemaOf } from './apiToolsBuild.ts'
import type { ApiToolSpec, ApiToolsUi } from './apiToolsUi.ts'
import type { FlowMaker } from './webhookFlow.ts'

const schema = { type: 'object', properties: { tanggal: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['tanggal'] }
const config = {
  apiIntegrations: [
    // A client endpoint: the webhook is an Automation flow.
    { name: 'cek_jadwal', description: 'Cek slot dokter', targetMethod: 'GET', targetUrl: 'https://api.klinik.example/slots', authUrl: '', aiInput: schema },
    // Only a webhook address (e.g. n8n): used as it is.
    { name: 'buat_booking', description: 'Buat booking', httpMethod: 'PUT', webhookAddress: 'https://workflows.example/webhook/booking', apiKey: 'k-1', aiInput: {} },
    { name: 'tanpa_url', webhookAddress: '', targetUrl: '' },
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

const flowMaker = () => vi.fn<FlowMaker>(async (tool) => ({ url: `https://automation.cekat.ai/api/v1/webhooks/flow-${tool.name}/sync`, problems: [] }))

describe('schemaOf', () => {
  it('keeps the POC schema and gives an empty one when there is none', () => {
    expect(schemaOf(schema)).toEqual(schema)
    expect(schemaOf({})).toEqual({ type: 'object', properties: {} })
    expect(schemaOf('x')).toEqual({ type: 'object', properties: {} })
  })
})

describe('planApiTools', () => {
  it('uses a flow for a client endpoint and the webhook address otherwise, and says why others are skipped', () => {
    const plan = planApiTools(config)
    expect(plan.tools.map((t) => [t.spec.name, t.spec.method, !!t.flow])).toEqual([
      ['cek_jadwal', 'POST', true],
      ['buat_booking', 'POST', false],
    ])
    expect(plan.tools[0].flow).toEqual({ name: 'cek_jadwal', inputs: ['tanggal'], targetMethod: 'GET', targetUrl: 'https://api.klinik.example/slots', authUrl: '' })
    expect(plan.tools[1].spec).toMatchObject({ apiKey: 'k-1', webhookAddress: 'https://workflows.example/webhook/booking' })
    expect(plan.problems).toEqual([
      expect.stringContaining('"buat_booking": Cekat tools only call GET or POST'),
      expect.stringContaining('"tanpa_url" is skipped'),
      expect.stringContaining('"Bad Name" is skipped'),
    ])
  })
})

describe('runApiToolsBuild', () => {
  it('builds the flow, creates each tool on its webhook and activates it on the agent', async () => {
    const { ui, created } = fakeUi()
    const flows = flowMaker()
    const result = await runApiToolsBuild(ui, 'agent-1', config, () => {}, flows)
    expect(flows).toHaveBeenCalledTimes(1)
    expect(created.map((t) => [t.name, t.webhookAddress])).toEqual([
      ['cek_jadwal', 'https://automation.cekat.ai/api/v1/webhooks/flow-cek_jadwal/sync'],
      ['buat_booking', 'https://workflows.example/webhook/booking'],
    ])
    expect(result).toMatchObject({ created: ['cek_jadwal', 'buat_booking'], activated: ['cek_jadwal', 'buat_booking'], flows: ['cek_jadwal'] })
  })

  it('skips tools that need a flow when Cekat MCP is not connected, or when the flow fails', async () => {
    const { ui, created } = fakeUi()
    const noMcp = await runApiToolsBuild(ui, 'agent-1', config, () => {}, null)
    expect(noMcp.problems).toEqual(expect.arrayContaining([expect.stringContaining('"cek_jadwal" is skipped: its Automation flow needs Cekat MCP')]))
    const failing = vi.fn<FlowMaker>(async () => {
      throw new Error('a flow named "cek_jadwal" already exists in Cekat Automation')
    })
    const failed = await runApiToolsBuild(fakeUi().ui, 'agent-1', config, () => {}, failing)
    expect(failed.problems).toEqual(expect.arrayContaining([expect.stringContaining('"cek_jadwal" is skipped: a flow named')]))
    expect(created.map((t) => t.name)).toEqual(['buat_booking'])
  })

  it('leaves tools whose name already exists alone', async () => {
    const { ui, created } = fakeUi(['cek_jadwal'])
    const flows = flowMaker()
    const result = await runApiToolsBuild(ui, 'agent-1', config, () => {}, flows)
    expect(flows).not.toHaveBeenCalled()
    expect(created.map((t) => t.name)).toEqual(['buat_booking'])
    expect(result.problems).toEqual(expect.arrayContaining([expect.stringContaining('"cek_jadwal" already exists')]))
  })

  it('reports a tool that did not become active', async () => {
    const { ui } = fakeUi([], { activates: false })
    const result = await runApiToolsBuild(ui, 'agent-1', config, () => {}, flowMaker())
    expect(result.activated).toEqual([])
    expect(result.problems).toEqual(expect.arrayContaining([expect.stringContaining('"cek_jadwal" was created but is not active')]))
  })

  it('does nothing without API integrations', async () => {
    const { ui, created } = fakeUi()
    expect(await runApiToolsBuild(ui, 'agent-1', {}, () => {}, null)).toEqual({ created: [], activated: [], flows: [], problems: [] })
    expect(created).toEqual([])
  })
})
