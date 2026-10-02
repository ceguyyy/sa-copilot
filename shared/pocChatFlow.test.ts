import { describe, expect, it } from 'vitest'
import {
  CHAT_FLOW_LIMITS,
  type ChatFlow,
  type FlowStep,
  flowMermaid,
  flowNodes,
  flowOutline,
  insertAfter,
  normalizeChatFlows,
  removeNode,
  updateNode,
  validateFlow,
} from './pocChatFlow.ts'

const endHuman = (id: string, agents: string[] = ['Sari']): FlowStep => ({ id, kind: 'end', end: { type: 'human', agents } })
const endAi = (id: string, agent = 'Order Bot'): FlowStep => ({ id, kind: 'end', end: { type: 'ai', agent } })

/** The flow from the Cekat screenshot, completed: every path ends in an End node. */
const complete = (): ChatFlow => ({
  id: 'f1',
  name: 'Inbound WhatsApp',
  start: {
    id: 'c',
    kind: 'conditions',
    branches: [
      {
        id: 'b-time',
        condition: { type: 'firstMessageTime', from: '08:00', to: '17:00', days: ['Mon', 'Tue'] },
        next: {
          id: 'msg',
          kind: 'buttons',
          message: 'Halo! Mau dibantu apa?',
          image: null,
          buttons: [{ id: 'btn-1', label: 'Lacak pesanan', next: endAi('end-ai') }],
          elseId: 'msg-else',
          elseNext: endHuman('end-cs'),
        },
      },
      { id: 'b-text', condition: { type: 'firstMessageText', text: 'PROMO' }, next: { id: 'a-label', kind: 'action', action: { type: 'addLabel', label: 'Promo' }, next: endHuman('end-promo') } },
    ],
    elseId: 'c-else',
    elseNext: { id: 'a-collab', kind: 'action', action: { type: 'addCollaborator', collaborator: 'Budi' }, next: endHuman('end-else') },
  },
})

describe('flowNodes', () => {
  it('lists every node in tree order with Cekat-style labels, numbering steps in one counter', () => {
    expect(flowNodes(complete()).map((n) => n.label)).toEqual([
      'Condition (First Message Time)',
      'Message 1',
      'Condition (Button Response)',
      'End 2 (AI Agent)',
      'Condition (Else)',
      'End 3 (Human Agent)',
      'Condition (First Message Text)',
      'Action 4 (Label)',
      'End 5 (Human Agent)',
      'Condition (Else)',
      'Action 6 (Collaborator)',
      'End 7 (Human Agent)',
    ])
  })
})

describe('validateFlow', () => {
  it('accepts a flow whose every path ends in a configured End node', () => {
    expect(validateFlow(complete())).toEqual([])
  })

  it('asks for a first node when the Start point is empty', () => {
    expect(validateFlow({ id: 'f', name: 'Empty', start: null })).toEqual(['Start point - Add A Condition Or End Flow'])
  })

  it('reports each open path and an End Human Agent without agents, like Cekat', () => {
    const flow = complete()
    const start = flow.start as Extract<FlowStep, { kind: 'conditions' }>
    const broken: ChatFlow = {
      ...flow,
      start: {
        ...start,
        branches: [{ ...start.branches[0], next: endHuman('e', []) }, { ...start.branches[1], next: null }],
        elseNext: { id: 'a3', kind: 'action', action: { type: 'addCollaborator', collaborator: 'Budi' }, next: null },
      },
    }
    expect(validateFlow(broken)).toEqual([
      'End 1 (Human Agent) - Select Human Agents',
      'Condition (First Message Text) - Add An End Node',
      'Action 2 (Collaborator) - Add An End Node',
    ])
  })

  it('treats a Jump as the end of its path but requires a valid target', () => {
    const jumpTo = (targetId: string): ChatFlow => ({ id: 'f', name: 'J', start: { id: 'j', kind: 'action', action: { type: 'jump', targetId }, next: null } as FlowStep })
    expect(validateFlow({ ...complete(), start: { ...(complete().start as Extract<FlowStep, { kind: 'conditions' }>), elseNext: { id: 'j', kind: 'action', action: { type: 'jump', targetId: 'msg' }, next: null } } })).toEqual([])
    expect(validateFlow(jumpTo(''))).toContain('Action 1 (Jump) - Select A Target Node')
    expect(validateFlow(jumpTo('j'))).toContain('Action 1 (Jump) - Select A Target Node')
  })

  it('checks the field limits of Message with Buttons', () => {
    const tooMany = Array.from({ length: CHAT_FLOW_LIMITS.buttons + 1 }, (_, i) => ({ id: `b${i}`, label: `B${i}`, next: endAi(`e${i}`) }))
    const flow: ChatFlow = {
      id: 'f',
      name: 'Buttons',
      start: { id: 'm', kind: 'buttons', message: 'x'.repeat(CHAT_FLOW_LIMITS.message + 1), image: null, buttons: tooMany, elseId: 'm-else', elseNext: endAi('ee') },
    }
    expect(validateFlow(flow)).toEqual(expect.arrayContaining(['Message 1 - Message Is Over 10000 Characters', 'Message 1 - Use At Most 10 Buttons']))
    const long: ChatFlow = { ...flow, start: { ...(flow.start as Extract<FlowStep, { kind: 'buttons' }>), message: 'Hi', buttons: [{ id: 'b', label: 'x'.repeat(21), next: endAi('e') }, { id: 'b2', label: '', next: endAi('e2') }] } }
    expect(validateFlow(long)).toEqual(['Message 1 - Button 1 Is Over 20 Characters', 'Message 1 - Button 2 Needs A Label'])
  })

  it('requires the fields each condition and action needs', () => {
    const flow: ChatFlow = {
      id: 'f',
      name: 'Fields',
      start: {
        id: 'c',
        kind: 'conditions',
        branches: [
          { id: 't', condition: { type: 'firstMessageText', text: ' ' }, next: endAi('e1') },
          { id: 'h', condition: { type: 'firstMessageTime', from: '', to: '17:00', days: [] }, next: { id: 'w', kind: 'action', action: { type: 'webhook', url: 'not a url' }, next: endAi('e2') } },
        ],
        elseId: 'ce',
        elseNext: endAi('e3', ''),
      },
    }
    expect(validateFlow(flow)).toEqual([
      'Condition (First Message Text) - Fill In The Trigger Text',
      'Condition (First Message Time) - Set The Time Range',
      'Condition (First Message Time) - Select At Least One Day',
      'Action 2 (Webhook) - Use An http(s) URL',
      'End 4 (AI Agent) - Select An AI Agent',
    ])
  })
})

describe('updateNode / removeNode', () => {
  it('replaces a nested node without touching the original flow', () => {
    const flow = complete()
    const next = updateNode(flow, 'a-label', (n) => ({ ...(n as Extract<FlowStep, { kind: 'action' }>), action: { type: 'addLabel', label: 'VIP' } }))
    expect(flowOutline(next)).toContain('Action 4 (Label): VIP')
    expect(flowOutline(flow)).toContain('Action 4 (Label): Promo')
  })

  it('removing a step empties its slot; removing a condition drops the branch', () => {
    const noMsg = removeNode(complete(), 'msg')
    expect(validateFlow(noMsg)).toEqual(['Condition (First Message Time) - Add An End Node'])
    expect(flowNodes(removeNode(complete(), 'b-text')).map((n) => n.label)).not.toContain('Condition (First Message Text)')
  })
})

describe('flowOutline', () => {
  it('renders an indented tree with every copyable field', () => {
    const outline = flowOutline(complete())
    expect(outline.split('\n').slice(0, 6)).toEqual([
      'Flow: Inbound WhatsApp',
      'Start point',
      '├─ Condition (First Message Time): 08:00–17:00, Mon, Tue',
      '│  └─ Message 1: Halo! Mau dibantu apa?',
      '│     ├─ Condition (Button Response): Lacak pesanan',
      '│     │  └─ End 2 (AI Agent): Order Bot',
    ])
  })
})

describe('flowMermaid', () => {
  it('draws the tree top-down with quoted labels and a dotted jump edge', () => {
    const flow = complete()
    const withJump: ChatFlow = { ...flow, start: { ...(flow.start as Extract<FlowStep, { kind: 'conditions' }>), elseNext: { id: 'j', kind: 'action', action: { type: 'jump', targetId: 'msg' }, next: null } } }
    const src = flowMermaid(withJump)
    expect(src.startsWith('flowchart TD')).toBe(true)
    expect(src).toContain('start(["Start point"])')
    expect(src).toContain('-.->|jump|')
    const quoted = flowMermaid(updateNode(flow, 'msg', (n) => ({ ...(n as Extract<FlowStep, { kind: 'buttons' }>), message: 'Say "hi"' })))
    expect(quoted).toContain('Say #quot;hi#quot;')
  })
})

describe('normalizeChatFlows', () => {
  it('gives POCs saved before POC Flow existed an empty list', () => {
    expect(normalizeChatFlows(undefined)).toEqual({ flows: [] })
    expect(normalizeChatFlows({ flows: [complete()] }).flows).toHaveLength(1)
  })
})

describe('insertAfter', () => {
  const findNode = (flow: ChatFlow, label: string) => flowNodes(flow).find((n) => n.label === label)!

  it('inserts an action between a condition and its next node, keeping the rest of the path', () => {
    const flow = complete()
    const next = insertAfter(flow, findNode(flow, 'Condition (First Message Text)'), { id: 'new', kind: 'action', action: { type: 'sendMessage', message: 'Hai' }, next: null })
    const labels = flowNodes(next).map((n) => n.label)
    expect(labels.slice(6, 10)).toEqual(['Condition (First Message Text)', 'Action 4 (Send Message)', 'Action 5 (Label)', 'End 6 (Human Agent)'])
    expect(validateFlow(next)).toEqual([])
  })

  it('inserts after an Else and after an action', () => {
    const flow = complete()
    const afterElse = insertAfter(flow, flowNodes(flow).filter((n) => n.kind === 'else')[1], { id: 'n1', kind: 'action', action: { type: 'addLabel', label: 'Else' }, next: null })
    expect(flowOutline(afterElse)).toMatch(/Condition \(Else\)\n.*Action \d \(Label\): Else\n.*Action \d \(Collaborator\): Budi/)
    const afterAction = insertAfter(flow, findNode(flow, 'Action 4 (Label)'), { id: 'n2', kind: 'action', action: { type: 'addCollaborator', collaborator: 'Rina' }, next: null })
    expect(flowOutline(afterAction)).toMatch(/Action 4 \(Label\): Promo\n.*Action 5 \(Collaborator\): Rina\n.*End 6/)
  })

  it('moves the rest of the path under the Else of an inserted Message with Buttons', () => {
    const flow = complete()
    const msg: FlowStep = { id: 'm2', kind: 'buttons', message: 'Pilih', image: null, buttons: [{ id: 'k', label: 'Ya', next: null }], elseId: 'm2-else', elseNext: null }
    const next = insertAfter(flow, findNode(flow, 'Condition (First Message Text)'), msg)
    expect(flowOutline(next)).toMatch(/Message 4: Pilih\n.*Condition \(Button Response\): Ya\n.*Condition \(Else\)\n.*Action 5 \(Label\): Promo/)
    expect(validateFlow(next)).toEqual(['Condition (Button Response) - Add An End Node'])
  })

  it('fills an open slot when there is nothing after the node yet', () => {
    const open = removeNode(complete(), 'a-label')
    const next = insertAfter(open, findNode(open, 'Condition (First Message Text)'), { id: 'e', kind: 'end', end: { type: 'ai', agent: 'Bot' } })
    expect(validateFlow(next)).toEqual([])
  })
})
