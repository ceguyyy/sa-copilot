import { describe, expect, it, vi } from 'vitest'
import { chatFlowsFromAi } from '../../shared/pocChatFlowAi.ts'

vi.stubEnv('DATABASE_URL', 'postgres://test@localhost/test')
const { chatFlowSchema } = await import('./pocChatFlowDraft.ts')
const { pocConfig } = await import('../validation.ts')

const blank = { conditionType: '', text: '', from: '', to: '', days: [], actionType: '', value: '', jumpTo: '', message: '', buttons: [], elseRef: '', endType: '', agents: [], aiAgent: '', nextRef: '' }

describe('POC Flow AI draft', () => {
  it('asks for every node field, as structured outputs require', () => {
    const node = (chatFlowSchema.properties.flows as { items: { properties: { nodes: { items: { required: string[] } } } } }).items.properties.nodes.items
    expect(node.required).toEqual(expect.arrayContaining(['ref', 'kind', 'buttons', 'nextRef', 'jumpTo', 'endType']))
  })

  it('stores what the model returns in a shape the POC schema accepts', () => {
    const chatFlows = chatFlowsFromAi({
      flows: [
        {
          name: 'Main menu',
          start: { conditionRefs: ['c'], elseRef: 'e', endRef: '' },
          nodes: [
            { ...blank, ref: 'c', kind: 'condition', conditionType: 'firstMessageTime', from: '08:00', to: '25:00', days: ['Mon'], nextRef: 'm' },
            { ...blank, ref: 'm', kind: 'buttons', message: 'Menu', buttons: [{ label: 'Lacak pesanan saya sekarang', nextRef: 'e' }], elseRef: 'e' },
            { ...blank, ref: 'e', kind: 'end', endType: 'human', agents: ['CS'] },
          ],
        },
      ],
    })
    expect(() => pocConfig.parse({ chatFlows })).not.toThrow()
  })
})
