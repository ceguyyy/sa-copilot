import { describe, expect, it } from 'vitest'
import { missingTexts, planAgentBuild, runAgentBuild, settingsOf } from './agentBuild.ts'
import type { AgentUi } from './agentUi.ts'

const config = {
  welcomeMessage: 'Halo! Ada yang bisa dibantu?',
  communicationStyle: 'Ramah dan singkat',
  conversationFlow: '1. Sapa\n2. Tanya kebutuhan',
  rulesRestrictions: '',
  customInstructions: [
    { title: 'Promo', content: 'Diskon 10%' },
    { title: '', content: 'Pakai emoji secukupnya' },
    { title: 'Kosong', content: '  ' },
  ],
  stopAiAfterHandoff: true,
  silentAgentHandoff: false,
  additionalSettings: { aiHistoryLimit: 5, aiReadFileLimit: 2, aiContextLimit: 8, aiTemperature: 'low' as const, messageAwait: 3, aiMessageLimit: 500, sessionOnlyMemory: 'per_thread' as const, ignoreTeamHandoff: true },
}

function fakeUi(existing: string[] = [], savedPage?: (texts: string[]) => string) {
  const calls: string[] = []
  const saved: string[] = []
  const ui: AgentUi = {
    hasAgent: async (name) => existing.includes(name),
    createAgent: async (name) => (calls.push(`create ${name}`), 'agent-1'),
    fillField: async (_id, title, text) => void (calls.push(`field ${title}`), saved.push(text)),
    addInstruction: async (_id, title, text) => void (calls.push(`instruction ${title}`), saved.push(title, text)),
    applySettings: async (_id, s) => void calls.push(`settings ${s.creativity} history=${s.historyLimit}`),
    behaviorText: async () => (savedPage ? savedPage(saved) : saved.join('\n')),
  }
  return { ui, calls }
}

describe('settingsOf', () => {
  it('maps the POC settings onto the Cekat AI configuration within its limits', () => {
    const { settings, notes } = settingsOf(config)
    expect(settings).toEqual({
      stopAiAfterTransfer: true,
      silentTransfer: false,
      ignoreTeamHandoff: true,
      historyLimit: 10,
      readFileLimit: 2,
      contextLimit: 8,
      creativity: 'Consistent',
      messageAwait: 3,
      messageLimit: 500,
      sessionOnlyMemory: true,
    })
    expect(notes).toEqual([expect.stringContaining('raised to 10')])
  })
})

describe('planAgentBuild', () => {
  it('lists the fields with text and the instructions to add', () => {
    const plan = planAgentBuild('Klinik Sehat', config, false)
    expect(plan.fields.map((f) => f.title)).toEqual(['Welcome Message', 'Communication Style', 'Conversation Flow'])
    expect(plan.instructions).toEqual(['Promo', 'Instruction 2'])
    expect(plan.problems).toEqual([])
  })

  it('refuses an existing agent name and an empty behavior', () => {
    const plan = planAgentBuild('Klinik Sehat', { welcomeMessage: 'Halo' }, true)
    expect(plan.problems).toEqual([expect.stringContaining('already exists'), expect.stringContaining('Behavior is empty')])
  })

  it('reads a legacy single behavior prompt as the conversation flow', () => {
    expect(planAgentBuild('A', { agentBehavior: '# Agata' }, false).fields).toEqual([{ title: 'Conversation Flow', chars: 7 }])
  })
})

describe('runAgentBuild', () => {
  it('creates the agent, fills each field and instruction, applies the settings and checks the page', async () => {
    const { ui, calls } = fakeUi()
    const result = await runAgentBuild(ui, 'Klinik Sehat', config, () => {})
    expect(calls).toEqual([
      'create Klinik Sehat',
      'field Welcome Message',
      'field Communication Style',
      'field Conversation Flow',
      'instruction Promo',
      'instruction Instruction 2',
      'settings Consistent history=10',
    ])
    expect(result.agentId).toBe('agent-1')
    expect(result.url).toContain('/ai-agents-v2/agent-1')
    expect(result.problems.filter((p) => p.includes('was not found'))).toEqual([])
  })

  it('reports texts the page does not show after saving', async () => {
    const { ui } = fakeUi([], (texts) => texts.filter((t) => !t.startsWith('1. Sapa')).join('\n'))
    const result = await runAgentBuild(ui, 'Klinik Sehat', config, () => {})
    expect(result.problems).toContain('"Conversation Flow" was not found on the agent\'s behavior page after saving; check it in Cekat.')
  })

  it('stops before creating anything when the name is taken', async () => {
    const { ui, calls } = fakeUi(['Klinik Sehat'])
    await expect(runAgentBuild(ui, 'Klinik Sehat', config, () => {})).rejects.toThrow('already exists')
    expect(calls).toEqual([])
  })
})

describe('missingTexts', () => {
  it('ignores whitespace differences such as line breaks turned into paragraphs', () => {
    expect(missingTexts('Halo\n\n1. Sapa 2. Tanya', [{ title: 'Flow', text: '1. Sapa\n2. Tanya' }])).toEqual([])
  })
})
