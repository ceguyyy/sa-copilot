import { describe, expect, it, vi } from 'vitest'
import { aiInputsOf, flowArgs, httpConnection, planTools, runToolsBuild } from './toolsBuild.ts'
import type { CekatCall } from './pocPush.ts'

const config = {
  apiIntegrations: [
    {
      name: 'cek_jadwal',
      description: 'Cek slot dokter',
      targetMethod: 'GET',
      targetUrl: 'https://api.klinik.example/slots',
      authUrl: '',
      aiInput: { type: 'object', properties: { tanggal: { type: 'string', description: 'YYYY-MM-DD' }, poli: { type: 'string', enum: ['umum', 'gigi'] }, jumlah: { type: 'integer' } }, required: ['tanggal'] },
    },
    { name: 'buat_booking', description: 'Buat booking', targetMethod: 'POST', targetUrl: 'https://api.klinik.example/bookings', authUrl: 'https://api.klinik.example/login', aiInput: { type: 'object', properties: { nama: { type: 'string' } } } },
    { name: 'tanpa_url', targetUrl: '' },
    { name: 'Bad Name', targetUrl: 'https://x.example' },
  ],
}

describe('aiInputsOf', () => {
  it('turns a JSON Schema into Cekat AI inputs', () => {
    expect(aiInputsOf(config.apiIntegrations[0].aiInput)).toEqual([
      { name: 'tanggal', description: 'YYYY-MM-DD', type: 'string', required: true },
      { name: 'poli', description: '', type: 'string', required: false, enum: [{ value: 'umum' }, { value: 'gigi' }] },
      { name: 'jumlah', description: '', type: 'number', required: false },
    ])
    expect(aiInputsOf('not a schema')).toEqual([])
  })
})

describe('planTools', () => {
  it('keeps tools with a valid name and endpoint, and says why others are skipped', () => {
    const plan = planTools(config)
    expect(plan.tools.map((t) => t.name)).toEqual(['cek_jadwal', 'buat_booking'])
    expect(plan.problems).toEqual([expect.stringContaining('"tanpa_url" is skipped'), expect.stringContaining('"Bad Name" is skipped')])
  })
})

describe('flowArgs', () => {
  it('sends GET inputs as query parameters and replies with the API body', () => {
    const args = flowArgs(planTools(config).tools[0], 'agent-1', 'conn-1') as { trigger: { input: Record<string, unknown> }; steps: Record<string, any>[] }
    expect(args.trigger.input).toMatchObject({ agentIds: ['agent-1'], toolName: 'cek_jadwal', toolDescription: 'Cek slot dokter' })
    expect(args.steps).toHaveLength(2)
    expect(args.steps[0]).toMatchObject({ pieceName: 'http', auth: 'conn-1', input: { method: 'GET', body_type: 'none', queryParams: { tanggal: "{{trigger['output'].body.inputs.tanggal}}" } } })
    expect(args.steps[1].input.fields.body).toBe("{{step_1['output'].body}}")
  })

  it('logs in first when the API has a login endpoint, and sends other methods as a JSON body', () => {
    const args = flowArgs(planTools(config).tools[1], 'agent-1', 'conn-1') as { steps: Record<string, any>[] }
    expect(args.steps.map((s) => s.displayName)).toEqual(['Log in to the client API (fill in the body)', 'Call buat_booking', 'Reply to the AI agent'])
    expect(args.steps[1].input).toMatchObject({ method: 'POST', body_type: 'json', body: { data: { nama: "{{trigger['output'].body.inputs.nama}}" } }, headers: { Authorization: "Bearer {{step_1['output'].body.token}}" } })
    expect(args.steps[2].input.fields.body).toBe("{{step_2['output'].body}}")
  })
})

describe('runToolsBuild', () => {
  const cekat = (connections: { externalId: string; status: string; pieceName?: string }[], flows: string[] = []) => {
    const built: string[] = []
    const call = vi.fn<CekatCall>(async (tool, args) => {
      if (tool === 'automation_ckt_list_connections') return JSON.stringify({ connections: connections.filter((c) => !args.pieceName || c.pieceName === args.pieceName) })
      if (tool === 'automation_ckt_list_flows') return JSON.stringify({ flows: flows.map((displayName) => ({ displayName })) })
      if (tool === 'automation_ckt_build_flow') {
        built.push(String(args.flowName))
        return JSON.stringify({ flowUrl: `https://chat.cekat.ai/automations/flows/${args.flowName}`, invalidSteps: [] })
      }
      return '{}'
    })
    return { call, built }
  }

  it('stops with a clear message when the project has no active connection', async () => {
    const { call, built } = cekat([])
    const result = await runToolsBuild(call, 'agent-1', config, () => {})
    expect(built).toEqual([])
    expect(result.problems).toEqual(expect.arrayContaining([expect.stringContaining('API tools were not built: Cekat Automation has no active connection')]))
  })

  it('uses another active connection when there is no HTTP one', async () => {
    const { call } = cekat([{ externalId: 'drive-1', status: 'ACTIVE', pieceName: 'google-drive' }])
    await runToolsBuild(call, 'agent-1', config, () => {})
    const build = call.mock.calls.find(([tool]) => tool === 'automation_ckt_build_flow')
    expect((build?.[1].steps as { auth?: string }[])[0].auth).toBe('drive-1')
  })

  it('builds one draft flow per tool, skipping names that already exist', async () => {
    const { call, built } = cekat([{ externalId: 'conn-1', status: 'ACTIVE', pieceName: 'http' }], ['cek_jadwal'])
    const result = await runToolsBuild(call, 'agent-1', config, () => {})
    expect(built).toEqual(['buat_booking'])
    expect(result.flows).toEqual([{ name: 'buat_booking', url: 'https://chat.cekat.ai/automations/flows/buat_booking' }])
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.stringContaining('"cek_jadwal" already exists'), expect.stringContaining('fill in the login body'), expect.stringContaining('drafts')]),
    )
  })

  it('reads the active connection id', () => {
    expect(httpConnection(JSON.stringify({ connections: [{ externalId: 'x', status: 'ERROR' }, { externalId: 'y', status: 'ACTIVE' }] }))).toBe('y')
    expect(httpConnection('{}')).toBeNull()
  })
})
