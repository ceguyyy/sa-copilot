// POC Flow: the Cekat Flow builder modelled as a tree (no AI). A chat from a channel enters at the Start point,
// goes through conditions, actions and messages with buttons, and every path must end in a Human or AI agent.
// The SA rebuilds it in Cekat by hand from the tree, the outline and the copyable fields.

export const CHAT_FLOW_LIMITS = { message: 10_000, buttons: 10, buttonChars: 20, text: 1_000, flows: 20 } as const

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type WeekDay = (typeof WEEK_DAYS)[number]

/** First Message Text matches the customer's first message exactly and case-sensitively. */
export type FlowCondition =
  | { type: 'firstMessageText'; text: string }
  | { type: 'firstMessageTime'; from: string; to: string; days: WeekDay[] }

export type FlowAction =
  | { type: 'addLabel'; label: string }
  | { type: 'addCollaborator'; collaborator: string }
  | { type: 'sendMessage'; message: string }
  | { type: 'webhook'; url: string }
  | { type: 'jump'; targetId: string }

export type FlowEnd = { type: 'human'; agents: string[] } | { type: 'ai'; agent: string }

export type FlowBranch = { id: string; condition: FlowCondition; next: FlowStep | null }
export type ButtonBranch = { id: string; label: string; next: FlowStep | null }

/** "conditions" is a group of sibling Condition nodes plus their automatic Else; only the Start point holds one. */
export type FlowStep =
  | { id: string; kind: 'conditions'; branches: FlowBranch[]; elseId: string; elseNext: FlowStep | null }
  | { id: string; kind: 'action'; action: FlowAction; next: FlowStep | null }
  | { id: string; kind: 'buttons'; message: string; image: string | null; buttons: ButtonBranch[]; elseId: string; elseNext: FlowStep | null }
  | { id: string; kind: 'end'; end: FlowEnd }

export type FlowNode = FlowStep | FlowBranch | ButtonBranch
export type ChatFlow = { id: string; name: string; start: FlowStep | null }
export type ChatFlows = { flows: ChatFlow[] }

export const emptyChatFlows = (): ChatFlows => ({ flows: [] })

/** POCs saved before POC Flow existed get an empty list. */
export function normalizeChatFlows(raw: unknown): ChatFlows {
  const flows = raw && typeof raw === 'object' ? (raw as { flows?: unknown }).flows : undefined
  if (!Array.isArray(flows)) return emptyChatFlows()
  const isFlow = (f: unknown): f is ChatFlow => !!f && typeof f === 'object' && typeof (f as ChatFlow).id === 'string' && typeof (f as ChatFlow).name === 'string'
  return { flows: flows.filter(isFlow).map((f) => ({ ...f, start: f.start && typeof f.start === 'object' ? f.start : null })) }
}

/** Bounds on a stored POC Flow tree, checked before the recursive schema parse so a hostile body can't blow the stack. */
export const CHAT_FLOW_TREE_LIMITS = { depth: 100, nodes: 2_000, imageChars: 12_000_000 } as const

/**
 * Why raw chatFlows can't be stored (too deep, too many nodes, too much image data, repeated ids), or null.
 * Iterative on purpose: it must not recurse on untrusted nesting.
 */
export function chatFlowsSizeProblem(raw: unknown): string | null {
  const flows = raw && typeof raw === 'object' ? (raw as { flows?: unknown }).flows : undefined
  if (!Array.isArray(flows)) return null
  const stack: { value: unknown; depth: number }[] = flows.map((f) => ({ value: f && typeof f === 'object' ? (f as { start?: unknown }).start : null, depth: 1 }))
  const ids = new Set<string>()
  let nodes = 0
  let imageChars = 0
  const claim = (id: unknown) => {
    if (typeof id !== 'string') return null
    if (ids.has(id)) return `POC Flow node id "${id.slice(0, 64)}" repeats`
    ids.add(id)
    return null
  }
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (!value || typeof value !== 'object') continue
    if (depth > CHAT_FLOW_TREE_LIMITS.depth) return `POC Flow is too deep (more than ${CHAT_FLOW_TREE_LIMITS.depth} nodes in a path)`
    if (++nodes > CHAT_FLOW_TREE_LIMITS.nodes) return `POC Flow has more than ${CHAT_FLOW_TREE_LIMITS.nodes} nodes`
    const step = value as Record<string, unknown>
    const problem = claim(step.id) ?? claim(step.elseId)
    if (problem) return problem
    if (typeof step.image === 'string') imageChars += step.image.length
    if (imageChars > CHAT_FLOW_TREE_LIMITS.imageChars) return 'POC Flow images are too large in total'
    const branches = [...(Array.isArray(step.branches) ? step.branches : []), ...(Array.isArray(step.buttons) ? step.buttons : [])]
    for (const b of branches) {
      if (!b || typeof b !== 'object') continue
      const branchProblem = claim((b as { id?: unknown }).id)
      if (branchProblem) return branchProblem
      stack.push({ value: (b as { next?: unknown }).next, depth: depth + 1 })
    }
    stack.push({ value: step.next, depth: depth + 1 }, { value: step.elseNext, depth: depth + 1 })
  }
  return null
}

// ── Factories ────────────────────────────────────────────────────────────────

export const newId = (): string => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)

export const newFlow = (name: string): ChatFlow => ({ id: newId(), name, start: null })

export const newBranch = (type: FlowCondition['type']): FlowBranch => ({
  id: newId(),
  condition: type === 'firstMessageText' ? { type, text: '' } : { type, from: '08:00', to: '17:00', days: [...WEEK_DAYS] },
  next: null,
})

export const newConditions = (): FlowStep => ({ id: newId(), kind: 'conditions', branches: [newBranch('firstMessageText')], elseId: newId(), elseNext: null })

const EMPTY_ACTIONS: Record<FlowAction['type'], FlowAction> = {
  addLabel: { type: 'addLabel', label: '' },
  addCollaborator: { type: 'addCollaborator', collaborator: '' },
  sendMessage: { type: 'sendMessage', message: '' },
  webhook: { type: 'webhook', url: '' },
  jump: { type: 'jump', targetId: '' },
}

export const newAction = (type: FlowAction['type']): FlowStep => ({ id: newId(), kind: 'action', action: EMPTY_ACTIONS[type], next: null })

export const newButton = (): ButtonBranch => ({ id: newId(), label: '', next: null })

export const newButtons = (): FlowStep => ({ id: newId(), kind: 'buttons', message: '', image: null, buttons: [newButton()], elseId: newId(), elseNext: null })

export const newEnd = (type: FlowEnd['type']): FlowStep => ({ id: newId(), kind: 'end', end: type === 'human' ? { type, agents: [] } : { type, agent: '' } })

// ── Immutable edits ──────────────────────────────────────────────────────────

type Edit = (node: FlowNode) => FlowNode | null

function editStep(step: FlowStep | null, id: string, fn: Edit): FlowStep | null {
  if (!step) return null
  if (step.id === id) return fn(step) as FlowStep | null
  const editList = <B extends FlowBranch | ButtonBranch>(list: B[]): B[] =>
    list.flatMap((b) => {
      if (b.id !== id) return [{ ...b, next: editStep(b.next, id, fn) }]
      const edited = fn(b)
      return edited ? [edited as B] : []
    })
  switch (step.kind) {
    case 'conditions':
      return { ...step, branches: editList(step.branches), elseNext: editStep(step.elseNext, id, fn) }
    case 'buttons':
      return { ...step, buttons: editList(step.buttons), elseNext: editStep(step.elseNext, id, fn) }
    case 'action':
      return { ...step, next: editStep(step.next, id, fn) }
    case 'end':
      return step
  }
}

/** A copy of the flow with the node of this id replaced by fn(node). */
export const updateNode = (flow: ChatFlow, id: string, fn: (node: FlowNode) => FlowNode): ChatFlow => ({ ...flow, start: editStep(flow.start, id, fn) })

/** Removing a step empties the slot it sat in; removing a condition or button branch drops it with its path. */
export const removeNode = (flow: ChatFlow, id: string): ChatFlow => ({ ...flow, start: editStep(flow.start, id, () => null) })

function findStep(step: FlowStep | null, id: string): FlowStep | null {
  if (!step) return null
  if (step.id === id) return step
  switch (step.kind) {
    case 'conditions':
      return [...step.branches.map((b) => b.next), step.elseNext].reduce<FlowStep | null>((found, s) => found ?? findStep(s, id), null)
    case 'buttons':
      return [...step.buttons.map((b) => b.next), step.elseNext].reduce<FlowStep | null>((found, s) => found ?? findStep(s, id), null)
    case 'action':
      return findStep(step.next, id)
    case 'end':
      return null
  }
}

/** The step that follows a node in its slot (a branch's or action's next, or its owner's Else). */
export function slotNext(flow: ChatFlow, node: DisplayNode): FlowStep | null {
  if (node.kind === 'else') {
    const owner = node.ownerId ? findStep(flow.start, node.ownerId) : null
    return owner && (owner.kind === 'conditions' || owner.kind === 'buttons') ? owner.elseNext : null
  }
  return node.node && 'next' in node.node ? node.node.next : null
}

/** The flow with `step` in this node's slot, replacing whatever was there. */
export function setSlot(flow: ChatFlow, node: DisplayNode, step: FlowStep | null): ChatFlow {
  return node.kind === 'else' && node.ownerId
    ? updateNode(flow, node.ownerId, (owner) => ({ ...owner, elseNext: step }) as FlowNode)
    : updateNode(flow, node.id, (n) => ({ ...n, next: step }) as FlowNode)
}

/**
 * Inserts `step` right after this node (the "+" between nodes in Cekat). The rest of the path continues after an
 * action, or under the Else of a Message with Buttons; an End or Jump only goes into an empty slot.
 */
export function insertAfter(flow: ChatFlow, node: DisplayNode, step: FlowStep): ChatFlow {
  const rest = slotNext(flow, node)
  if (!rest) return setSlot(flow, node, step)
  if (step.kind === 'action' && step.action.type !== 'jump') return setSlot(flow, node, { ...step, next: rest })
  if (step.kind === 'buttons') return setSlot(flow, node, { ...step, elseNext: rest })
  return flow
}

/** Whether a node has a slot a step can be inserted into (Ends and Jumps end their path; a Message adds buttons instead). */
export const canInsertAfter = (node: DisplayNode): boolean =>
  node.kind === 'condition' || node.kind === 'button' || node.kind === 'else' || (node.kind === 'action' && !!node.node && 'action' in node.node && node.node.action.type !== 'jump')

// ── Display tree (Cekat-style labels and numbering) ──────────────────────────

export type DisplayKind = 'condition' | 'button' | 'else' | 'action' | 'buttons' | 'end'

export type DisplayNode = {
  id: string
  kind: DisplayKind
  label: string
  summary: string
  /** The step or branch itself; undefined for an Else. */
  node?: FlowNode
  /** The Else's owner (conditions or buttons step). */
  ownerId?: string
  /** True when the path stops here without an End node (a Jump is a valid end). */
  isOpen: boolean
  children: DisplayNode[]
}

const ACTION_NAMES: Record<FlowAction['type'], string> = {
  addLabel: 'Label',
  addCollaborator: 'Collaborator',
  sendMessage: 'Send Message',
  webhook: 'Webhook',
  jump: 'Jump',
}
const CONDITION_NAMES: Record<FlowCondition['type'], string> = { firstMessageText: 'First Message Text', firstMessageTime: 'First Message Time' }

export const actionName = (type: FlowAction['type']): string => ACTION_NAMES[type]
export const conditionName = (type: FlowCondition['type']): string => CONDITION_NAMES[type]

/** Agents typed as a comma list may hold blanks while editing. */
export const namedAgents = (agents: string[]): string[] => agents.map((a) => a.trim()).filter(Boolean)

const oneLine = (s: string) => s.trim().replace(/\s*\n\s*/g, ' ↵ ')

function conditionSummary(c: FlowCondition): string {
  return c.type === 'firstMessageText' ? c.text : `${c.from}–${c.to}, ${c.days.join(', ')}`
}

function buildTree(flow: ChatFlow): DisplayNode[] {
  let counter = 0
  const elseNode = (ownerId: string, elseId: string, next: FlowStep | null): DisplayNode => ({
    id: elseId,
    kind: 'else',
    label: 'Condition (Else)',
    summary: '',
    ownerId,
    isOpen: !next,
    children: slot(next),
  })
  const branchNode = (b: FlowBranch | ButtonBranch): DisplayNode => {
    const isButton = 'label' in b
    return {
      id: b.id,
      kind: isButton ? 'button' : 'condition',
      label: `Condition (${isButton ? 'Button Response' : CONDITION_NAMES[b.condition.type]})`,
      summary: isButton ? b.label : conditionSummary(b.condition),
      node: b,
      isOpen: !b.next,
      children: slot(b.next),
    }
  }
  function slot(step: FlowStep | null): DisplayNode[] {
    if (!step) return []
    if (step.kind === 'conditions') return [...step.branches.map(branchNode), elseNode(step.id, step.elseId, step.elseNext)]
    const n = ++counter
    switch (step.kind) {
      case 'action': {
        const head = { id: step.id, kind: 'action' as const, label: `Action ${n} (${ACTION_NAMES[step.action.type]})`, node: step }
        return [{ ...head, summary: actionSummary(step.action), isOpen: !step.next && step.action.type !== 'jump', children: slot(step.next) }]
      }
      case 'buttons': {
        const head = { id: step.id, kind: 'buttons' as const, label: `Message ${n}`, node: step, isOpen: false }
        const summary = oneLine(step.message) + (step.image ? ' [image]' : '')
        return [{ ...head, summary, children: [...step.buttons.map(branchNode), elseNode(step.id, step.elseId, step.elseNext)] }]
      }
      case 'end': {
        const summary = step.end.type === 'human' ? namedAgents(step.end.agents).join(', ') : step.end.agent
        return [{ id: step.id, kind: 'end', label: `End ${n} (${step.end.type === 'human' ? 'Human' : 'AI'} Agent)`, summary, node: step, isOpen: false, children: [] }]
      }
    }
  }
  return slot(flow.start)
}

function actionSummary(a: FlowAction): string {
  switch (a.type) {
    case 'addLabel':
      return a.label
    case 'addCollaborator':
      return a.collaborator
    case 'sendMessage':
      return oneLine(a.message)
    case 'webhook':
      return a.url
    case 'jump':
      return a.targetId // replaced with the target's label once every label is known
  }
}

const flatten = (nodes: DisplayNode[]): DisplayNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)])

/** The flow as a tree of display nodes, Jump summaries pointing at their target's label. */
export function flowTree(flow: ChatFlow): DisplayNode[] {
  const tree = buildTree(flow)
  const labels = new Map(flatten(tree).map((n) => [n.id, n.label]))
  const resolve = (nodes: DisplayNode[]): DisplayNode[] =>
    nodes.map((n) => {
      const jump = n.kind === 'action' && n.node && 'action' in n.node && n.node.action.type === 'jump' ? n.node.action : null
      return { ...n, summary: jump ? `→ ${labels.get(jump.targetId) ?? '(no target)'}` : n.summary, children: resolve(n.children) }
    })
  return resolve(tree)
}

/** Every node in tree order. */
export const flowNodes = (flow: ChatFlow): DisplayNode[] => flatten(flowTree(flow))

// ── Validation (mirrors Cekat's "Flow must end with a configured Human or AI Agent") ──

const isHttpUrl = (s: string) => /^https?:\/\//i.test(s.trim()) && URL.canParse(s.trim())

function fieldErrors(n: DisplayNode, ids: Set<string>): string[] {
  const node = n.node
  if (!node) return []
  if ('condition' in node) {
    const c = node.condition
    if (c.type === 'firstMessageText') {
      if (!c.text.trim()) return ['Fill In The Trigger Text']
      return c.text.length > CHAT_FLOW_LIMITS.text ? [`Trigger Text Is Over ${CHAT_FLOW_LIMITS.text} Characters`] : []
    }
    return [...(!c.from || !c.to ? ['Set The Time Range'] : []), ...(c.days.length ? [] : ['Select At Least One Day'])]
  }
  if (!('kind' in node)) return []
  switch (node.kind) {
    case 'action':
      return actionErrors(node.action, node.id, ids)
    case 'buttons':
      return buttonsErrors(node)
    case 'end':
      if (node.end.type === 'human') return namedAgents(node.end.agents).length ? [] : ['Select Human Agents']
      return node.end.agent.trim() ? [] : ['Select An AI Agent']
    default:
      return []
  }
}

function actionErrors(a: FlowAction, selfId: string, ids: Set<string>): string[] {
  switch (a.type) {
    case 'addLabel':
      return a.label.trim() ? [] : ['Fill In The Label']
    case 'addCollaborator':
      return a.collaborator.trim() ? [] : ['Select A Collaborator']
    case 'sendMessage':
      return messageErrors(a.message)
    case 'webhook':
      return isHttpUrl(a.url) ? [] : ['Use An http(s) URL']
    case 'jump':
      return a.targetId && a.targetId !== selfId && ids.has(a.targetId) ? [] : ['Select A Target Node']
  }
}

const messageErrors = (m: string) =>
  !m.trim() ? ['Fill In The Message'] : m.length > CHAT_FLOW_LIMITS.message ? [`Message Is Over ${CHAT_FLOW_LIMITS.message} Characters`] : []

function buttonsErrors(step: Extract<FlowStep, { kind: 'buttons' }>): string[] {
  const count = step.buttons.length
  return [
    ...messageErrors(step.message),
    ...(count === 0 ? ['Add At Least One Button'] : count > CHAT_FLOW_LIMITS.buttons ? [`Use At Most ${CHAT_FLOW_LIMITS.buttons} Buttons`] : []),
    ...step.buttons.flatMap((b, i) => {
      if (!b.label.trim()) return [`Button ${i + 1} Needs A Label`]
      if (b.label.length > CHAT_FLOW_LIMITS.buttonChars) return [`Button ${i + 1} Is Over ${CHAT_FLOW_LIMITS.buttonChars} Characters`]
      return step.buttons.findIndex((o) => o.label === b.label) < i ? [`Button ${i + 1} Repeats "${b.label}"`] : []
    }),
  ]
}

/** Problems that keep the flow from being saved in Cekat, as "<node> - <fix>". Empty when the flow is complete. */
export function validateFlow(flow: ChatFlow): string[] {
  if (!flow.start) return ['Start point - Add A Condition Or End Flow']
  const nodes = flowNodes(flow)
  const ids = new Set(nodes.map((n) => n.id))
  return nodes.flatMap((n) => [...fieldErrors(n, ids), ...(n.isOpen ? ['Add An End Node'] : [])].map((e) => `${n.label} - ${e}`))
}

/** Nodes a Jump can target: any node of the flow except the Jump itself. */
export const jumpTargets = (flow: ChatFlow, selfId: string): DisplayNode[] => flowNodes(flow).filter((n) => n.id !== selfId)

// ── Outputs ──────────────────────────────────────────────────────────────────

const line = (n: DisplayNode) => (n.summary ? `${n.label}: ${n.summary}` : n.label)

/** Indented text tree of the flow with every field value, to paste into notes or a ticket. */
export function flowOutline(flow: ChatFlow): string {
  const render = (nodes: DisplayNode[], prefix: string): string[] =>
    nodes.flatMap((n, i) => {
      const isLast = i === nodes.length - 1
      return [`${prefix}${isLast ? '└─ ' : '├─ '}${line(n)}`, ...render(n.children, `${prefix}${isLast ? '   ' : '│  '}`)]
    })
  return [`Flow: ${flow.name}`, 'Start point', ...render(flowTree(flow), '')].join('\n')
}

const MERMAID_SUMMARY_CHARS = 60
const mermaidId = (id: string) => `n_${id.replace(/\W/g, '_')}`
const mermaidText = (s: string) => s.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')

function mermaidLabel(n: DisplayNode): string {
  const summary = n.summary.length > MERMAID_SUMMARY_CHARS ? `${n.summary.slice(0, MERMAID_SUMMARY_CHARS)}…` : n.summary
  return `"${mermaidText(n.label)}${summary ? `<br/>${mermaidText(summary)}` : ''}"`
}

const SHAPES: Record<DisplayKind, [string, string, string]> = {
  condition: ['{{', '}}', 'cond'],
  button: ['{{', '}}', 'cond'],
  else: ['{{', '}}', 'cond'],
  action: ['[', ']', 'act'],
  buttons: ['[', ']', 'msg'],
  end: ['([', '])', 'endNode'],
}

/** Top-down Mermaid flowchart of the flow, like the Cekat canvas; a Jump is a dotted edge to its target. */
export function flowMermaid(flow: ChatFlow): string {
  const nodes = flowNodes(flow)
  const ids = new Set(nodes.map((n) => n.id))
  const defs = nodes.map((n) => {
    const [open, close, cls] = SHAPES[n.kind]
    return `  ${mermaidId(n.id)}${open}${mermaidLabel(n)}${close}:::${cls}`
  })
  const edges = (parent: string, children: DisplayNode[]): string[] => children.flatMap((c) => [`  ${parent} --> ${mermaidId(c.id)}`, ...edges(mermaidId(c.id), c.children)])
  const jumps = nodes.flatMap((n) => {
    const action = n.node && 'kind' in n.node && n.node.kind === 'action' ? n.node.action : null
    return action?.type === 'jump' && ids.has(action.targetId) ? [`  ${mermaidId(n.id)} -.->|jump| ${mermaidId(action.targetId)}`] : []
  })
  return [
    'flowchart TD',
    '  start(["Start point"]):::startNode',
    ...defs,
    ...edges('start', flowTree(flow)),
    ...jumps,
    '  classDef startNode fill:#2563eb,stroke:#1d4ed8,color:#ffffff',
    '  classDef cond fill:#fef3c7,stroke:#d97706,color:#1f2937',
    '  classDef act fill:#dbeafe,stroke:#2563eb,color:#1f2937',
    '  classDef msg fill:#e0e7ff,stroke:#4f46e5,color:#1f2937',
    '  classDef endNode fill:#dcfce7,stroke:#16a34a,color:#1f2937',
  ].join('\n')
}
