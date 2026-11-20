import { describe, expect, it, vi } from 'vitest'
import { firstConnection, webhookFlowArgs, webhookFlowMaker, type FlowTool } from './webhookFlow.ts'
import type { CekatCall } from './pocPush.ts'

const getTool: FlowTool = { name: 'cek_jadwal', inputs: ['tanggal'], targetMethod: 'GET', targetUrl: 'https://api.klinik.example/slots', authUrl: '' }
const postTool: FlowTool = { name: 'buat_booking', inputs: ['nama'], targetMethod: 'POST', targetUrl: 'https://api.klinik.example/bookings', authUrl: 'https://api.klinik.example/login' }

type Step = { displayName: string; pieceName: string; auth?: string; input: Record<string, any> }

describe('webhookFlowArgs', () => {
  it('catches the webhook, sends GET inputs as query parameters and returns the API body', () => {
    const args = webhookFlowArgs(getTool, 'conn-1') as { trigger: Record<string, unknown>; steps: Step[] }
    expect(args.trigger).toEqual({ pieceName: 'webhook', triggerName: 'catch_webhook', input: { authType: 'none' } })
    expect(args.steps).toHaveLength(2)
    expect(args.steps[0]).toMatchObject({ pieceName: 'http', auth: 'conn-1', input: { method: 'GET', body_type: 'none', queryParams: { tanggal: "{{trigger['output'].body.tanggal}}" } } })
    expect(args.steps[1]).toMatchObject({ pieceName: 'webhook', input: { fields: { body: "{{step_1['output'].body}}" }, respond: 'stop' } })
  })

  it('logs in first when there is a login endpoint, and sends other methods as a JSON body', () => {
    const args = webhookFlowArgs(postTool, 'conn-1') as { steps: Step[] }
    expect(args.steps.map((s) => s.displayName)).toEqual(['Log in to the client API (fill in the body)', 'Call buat_booking', 'Reply to the AI agent'])
    expect(args.steps[1].input).toMatchObject({ method: 'POST', body: { data: { nama: "{{trigger['output'].body.nama}}" } }, headers: { Authorization: "Bearer {{step_1['output'].body.token}}" } })
    expect(args.steps[2].input.fields.body).toBe("{{step_2['output'].body}}")
  })
})

describe('firstConnection', () => {
  it('reads the first active connection id', () => {
    expect(firstConnection(JSON.stringify({ connections: [{ externalId: 'x', status: 'ERROR' }, { externalId: 'y', status: 'ACTIVE' }] }))).toBe('y')
    expect(firstConnection('{}')).toBeNull()
  })
})

describe('webhookFlowMaker', () => {
  const cekat = (connections: { externalId: string; status: string; pieceName?: string }[], flows: string[] = []) =>
    vi.fn<CekatCall>(async (tool, args) => {
      if (tool === 'automation_ckt_list_connections') return JSON.stringify({ connections: connections.filter((c) => !args.pieceName || c.pieceName === args.pieceName) })
      if (tool === 'automation_ckt_list_flows') return JSON.stringify({ flows: flows.map((displayName) => ({ displayName })) })
      if (tool === 'automation_ckt_build_flow') return JSON.stringify({ flowId: `id-${args.flowName}`, invalidSteps: [] })
      if (tool === 'automation_ckt_lock_and_publish') return 'Flow published and enabled successfully.'
      return '{}'
    })
  const published = (call: ReturnType<typeof cekat>) => call.mock.calls.filter(([t]) => t === 'automation_ckt_lock_and_publish').map(([, a]) => a.flowId)

  it('builds and publishes the flow, using another active connection when there is no HTTP one', async () => {
    const call = cekat([{ externalId: 'drive-1', status: 'ACTIVE', pieceName: 'google-drive' }])
    const made = await (await webhookFlowMaker(call))(getTool)
    expect(made).toEqual({ url: 'https://automation.cekat.ai/api/v1/webhooks/id-cek_jadwal/sync', problems: [] })
    const build = call.mock.calls.find(([t]) => t === 'automation_ckt_build_flow')
    expect((build?.[1].steps as Step[])[0].auth).toBe('drive-1')
    expect(published(call)).toEqual(['id-cek_jadwal'])
  })

  it('leaves a flow with a login step as a draft for the SA', async () => {
    const call = cekat([{ externalId: 'http-1', status: 'ACTIVE', pieceName: 'http' }])
    const made = await (await webhookFlowMaker(call))(postTool)
    expect(made.problems).toEqual([expect.stringContaining('"buat_booking" is a draft')])
    expect(published(call)).toEqual([])
  })

  it('refuses without a connection or when the flow name is taken', async () => {
    await expect((await webhookFlowMaker(cekat([])))(getTool)).rejects.toThrow('no active connection')
    await expect((await webhookFlowMaker(cekat([{ externalId: 'c', status: 'ACTIVE' }], ['cek_jadwal'])))(getTool)).rejects.toThrow('already exists')
  })
})
