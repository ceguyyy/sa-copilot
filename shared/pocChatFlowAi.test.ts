import { describe, expect, it } from 'vitest'
import { chatFlowsFromAi } from './pocChatFlowAi.ts'
import { CHAT_FLOW_LIMITS, flowNodes, flowOutline, validateFlow } from './pocChatFlow.ts'

const blank = { conditionType: '', text: '', from: '', to: '', days: [], actionType: '', value: '', jumpTo: '', message: '', buttons: [], elseRef: '', endType: '', agents: [], aiAgent: '', nextRef: '' }
const node = (fields: Record<string, unknown>) => ({ ...blank, ...fields })

const aiFlow = {
  name: 'Inbound WhatsApp',
  start: { conditionRefs: ['c-hours', 'c-promo'], elseRef: 'a-offhours', endRef: '' },
  nodes: [
    node({ ref: 'c-hours', kind: 'condition', conditionType: 'firstMessageTime', from: '08:00', to: '17:00', days: ['Mon', 'Tue', 'Funday'], nextRef: 'm-menu' }),
    node({ ref: 'c-promo', kind: 'condition', conditionType: 'firstMessageText', text: 'PROMO', nextRef: 'a-label' }),
    node({ ref: 'm-menu', kind: 'buttons', message: 'Halo! Mau dibantu apa?', buttons: [{ label: 'Lacak pesanan', nextRef: 'e-ai' }, { label: 'Komplain', nextRef: 'e-cs' }], elseRef: 'e-cs' }),
    node({ ref: 'a-label', kind: 'action', actionType: 'addLabel', value: 'Promo', nextRef: 'e-cs' }),
    node({ ref: 'a-offhours', kind: 'action', actionType: 'sendMessage', value: 'Kami buka 08.00–17.00', nextRef: 'a-jump' }),
    node({ ref: 'a-jump', kind: 'action', actionType: 'jump', jumpTo: 'm-menu' }),
    node({ ref: 'e-ai', kind: 'end', endType: 'ai', aiAgent: 'Order Tracking Agent' }),
    node({ ref: 'e-cs', kind: 'end', endType: 'human', agents: ['CS Team'] }),
  ],
}

describe('chatFlowsFromAi', () => {
  it('builds the tree from the flat node list and resolves the jump to a real node', () => {
    const { flows } = chatFlowsFromAi({ flows: [aiFlow] })
    expect(flows).toHaveLength(1)
    const flow = flows[0]
    expect(flow.name).toBe('Inbound WhatsApp')
    expect(validateFlow(flow)).toEqual([])
    const outline = flowOutline(flow)
    expect(outline).toContain('Condition (First Message Time): 08:00–17:00, Mon, Tue')
    expect(outline).toContain('Condition (Button Response): Lacak pesanan')
    expect(outline).toContain('(Jump): → Message 1')
  })

  it('places a node referenced twice once and points the second reference at it with a Jump', () => {
    const { flows } = chatFlowsFromAi({ flows: [aiFlow] })
    // e-cs is the target of Komplain, the menu Else and the promo label: built once, then reached by jumps.
    expect(flowNodes(flows[0]).filter((n) => n.label.includes('(Human Agent)'))).toHaveLength(1)
    expect(validateFlow(flows[0])).toEqual([])
  })

  it('clips Cekat limits and never follows a cycle', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `Pilihan nomor ${i} yang panjang`, nextRef: 'loop' }))
    const { flows } = chatFlowsFromAi({
      flows: [
        {
          name: 'Loop',
          start: { conditionRefs: ['c'], elseRef: '', endRef: '' },
          nodes: [node({ ref: 'c', kind: 'condition', conditionType: 'firstMessageText', text: 'menu', nextRef: 'loop' }), node({ ref: 'loop', kind: 'buttons', message: 'x'.repeat(20_000), buttons: many, elseRef: 'loop' })],
        },
      ],
    })
    const group = flows[0].start
    const start = group?.kind === 'conditions' ? group.branches[0].next : null
    expect(start?.kind).toBe('buttons')
    if (start?.kind !== 'buttons') return
    expect(start.message).toHaveLength(CHAT_FLOW_LIMITS.message)
    expect(start.buttons).toHaveLength(CHAT_FLOW_LIMITS.buttons)
    expect(start.buttons.every((b) => b.label.length <= CHAT_FLOW_LIMITS.buttonChars)).toBe(true)
    expect(start.buttons[0].next).toMatchObject({ kind: 'action', action: { type: 'jump', targetId: start.id } })
  })

  it('drops conditions outside the Start point, unknown refs and empty flows', () => {
    const { flows } = chatFlowsFromAi({
      flows: [
        { name: '', start: { conditionRefs: [], elseRef: '', endRef: '' }, nodes: [] },
        {
          name: 'Bad',
          start: { conditionRefs: ['c0', 'ghost'], elseRef: '', endRef: 'a' },
          nodes: [
            node({ ref: 'c0', kind: 'condition', conditionType: 'firstMessageText', text: 'hi', nextRef: 'a' }),
            node({ ref: 'a', kind: 'action', actionType: 'addLabel', value: 'X', nextRef: 'c' }),
            node({ ref: 'c', kind: 'condition', conditionType: 'firstMessageText', text: 'hi' }),
          ],
        },
        { name: 'Action at start', start: { conditionRefs: [], elseRef: '', endRef: 'a' }, nodes: [node({ ref: 'a', kind: 'action', actionType: 'addLabel', value: 'X' })] },
      ],
    })
    expect(flows.map((f) => f.name)).toEqual(['Bad', 'Action at start'])
    expect(validateFlow(flows[0])).toEqual(['Action 1 (Label) - Add An End Node', 'Condition (Else) - Add An End Node'])
    expect(flows[1].start).toBeNull()
    expect(chatFlowsFromAi(null)).toEqual({ flows: [] })
  })
})
