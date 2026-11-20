import { describe, expect, it } from 'vitest'
import { planRouting, runRoutingBuild } from './routingBuild.ts'
import type { RoutingUi } from './routingUi.ts'

const config = {
  agentTransferConditions: 'Pelanggan minta bicara dengan manusia atau komplain berat.',
  labels: [
    { name: 'Booking', condition: 'Pelanggan memilih jadwal' },
    { name: 'Komplain', condition: '' },
    { name: '', condition: 'tanpa nama' },
    { name: 'x'.repeat(120), condition: '' },
  ],
  pipeline: [
    { order: 2, status: 'Qualified', condition: 'Sudah isi nama dan kebutuhan' },
    { order: 1, status: 'New Lead', condition: '' },
    { order: 3, status: 'Booked', condition: 'Jadwal dikonfirmasi' },
  ],
}

function fakeUi(labels: string[], statuses: string[], shown?: string) {
  const calls: string[] = []
  const ui: RoutingUi = {
    labelNames: async () => labels,
    createLabel: async (name) => void calls.push(`label ${name}`),
    createPipelineStatus: async (name) => void calls.push(`status ${name}`),
    pipelineNames: async () => statuses,
    addTransferCondition: async (_id, title) => void calls.push(`transfer ${title}`),
    addLabelCondition: async (_id, title, label) => void calls.push(`label-condition ${title}=${label}`),
    addPipelineCondition: async (_id, _title, current, target) => void calls.push(`pipeline ${current ?? '*'}>${target}`),
    routingText: async () => shown ?? calls.join('\n') + '\nAgent transfer\nBooking\nKomplain\nNew Lead → Qualified\nQualified → Booked',
  }
  return { ui, calls }
}

describe('planRouting', () => {
  it('turns labels, the transfer text and the pipeline order into conditions', () => {
    const plan = planRouting(config)
    expect(plan.transfer).toContain('komplain berat')
    expect(plan.labels.map((l) => [l.title, l.description])).toEqual([
      ['Booking', 'Pelanggan memilih jadwal'],
      ['Komplain', 'Apply when the conversation is about Komplain.'],
    ])
    expect(plan.moves).toEqual([
      { title: 'New Lead → Qualified', current: 'New Lead', target: 'Qualified', description: 'Sudah isi nama dan kebutuhan' },
      { title: 'Qualified → Booked', current: 'Qualified', target: 'Booked', description: 'Jadwal dikonfirmasi' },
    ])
    expect(plan.problems).toEqual([expect.stringContaining('longer than 100 characters')])
  })

  it('gives the first status a condition only when the POC has one', () => {
    expect(planRouting({ pipeline: [{ order: 1, status: 'Baru', condition: 'Chat pertama' }] }).moves).toEqual([
      { title: 'Baru', current: null, target: 'Baru', description: 'Chat pertama' },
    ])
  })
})

describe('runRoutingBuild', () => {
  it('creates only missing labels, adds every condition and checks the page', async () => {
    const { ui, calls } = fakeUi(['booking'], ['New Lead', 'Qualified', 'Booked'])
    const result = await runRoutingBuild(ui, 'agent-1', config, () => {})
    expect(calls).toEqual([
      'label Komplain',
      'transfer Agent transfer',
      'label-condition Booking=Booking',
      'label-condition Komplain=Komplain',
      'pipeline New Lead>Qualified',
      'pipeline Qualified>Booked',
    ])
    expect(result.createdLabels).toEqual(['Komplain'])
    expect(result.conditions).toBe(5)
    expect(result.problems.filter((p) => !p.includes('longer than'))).toEqual([])
  })

  it('creates the pipeline statuses Cekat does not have before adding the moves', async () => {
    const { ui, calls } = fakeUi(['Booking', 'Komplain'], ['new lead'])
    const result = await runRoutingBuild(ui, 'agent-1', config, () => {})
    expect(calls.filter((c) => /^(status|pipeline)/.test(c))).toEqual(['status Qualified', 'status Booked', 'pipeline New Lead>Qualified', 'pipeline Qualified>Booked'])
    expect(result.createdStatuses).toEqual(['Qualified', 'Booked'])
  })

  it('reports conditions the page does not show after saving', async () => {
    const { ui } = fakeUi(['Booking', 'Komplain'], ['New Lead', 'Qualified', 'Booked'], 'Agent transfer\nBooking')
    const result = await runRoutingBuild(ui, 'agent-1', config, () => {})
    expect(result.problems).toContain('Condition "Komplain" was not found on the agent\'s AI Actions & Routing page after saving; check it in Cekat.')
  })

  it('does nothing when the POC has no routing', async () => {
    const { ui, calls } = fakeUi([], [])
    expect(await runRoutingBuild(ui, 'agent-1', {}, () => {})).toEqual({ createdLabels: [], createdStatuses: [], conditions: 0, problems: [] })
    expect(calls).toEqual([])
  })
})
