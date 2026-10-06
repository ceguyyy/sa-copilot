// AI draft of the POC Flow. The model writes each flow as a flat list of nodes that point at each other by "ref"
// (a recursive schema is unreliable for structured output); this builds the Cekat tree from it. A node reached a
// second time becomes a Jump to where it was first placed, so the result is always a finite tree.
import {
  CHAT_FLOW_LIMITS,
  type ChatFlow,
  type ChatFlows,
  type FlowAction,
  type FlowBranch,
  type FlowCondition,
  type FlowStep,
  WEEK_DAYS,
  type WeekDay,
  newId,
} from './pocChatFlow.ts'
import { POC_LABEL_MAX_CHARS } from './pocLimits.ts'

type Raw = Record<string, unknown>

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const records = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : [])
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const time = (v: unknown) => {
  const t = text(v, 5)
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : ''
}

const MAX_DEPTH = 60
const ACTION_TYPES = ['addLabel', 'addCollaborator', 'sendMessage', 'webhook', 'jump'] as const

function condition(n: Raw): FlowCondition {
  if (n.conditionType === 'firstMessageTime') {
    const days = strings(n.days)
    return { type: 'firstMessageTime', from: time(n.from), to: time(n.to), days: WEEK_DAYS.filter((d) => days.includes(d)) as WeekDay[] }
  }
  return { type: 'firstMessageText', text: text(n.text, CHAT_FLOW_LIMITS.text) }
}

function action(n: Raw, targetId: (ref: string) => string): FlowAction {
  const type = (ACTION_TYPES as readonly unknown[]).includes(n.actionType) ? (n.actionType as FlowAction['type']) : 'sendMessage'
  switch (type) {
    case 'addLabel':
      return { type, label: text(n.value, POC_LABEL_MAX_CHARS) }
    case 'addCollaborator':
      return { type, collaborator: text(n.value, 200) }
    case 'sendMessage':
      return { type, message: text(n.value, CHAT_FLOW_LIMITS.message) }
    case 'webhook':
      return { type, url: text(n.value, 2_000) }
    case 'jump':
      return { type, targetId: targetId(text(n.jumpTo, 200)) }
  }
}

function flowFromAi(raw: Raw): ChatFlow {
  const nodes = new Map<string, Raw>()
  for (const n of records(raw.nodes)) {
    const ref = text(n.ref, 200)
    if (ref && !nodes.has(ref)) nodes.set(ref, n)
  }
  const ids = new Map<string, string>()
  const idOf = (ref: string) => ids.get(ref) ?? ids.set(ref, newId()).get(ref)!
  const targetId = (ref: string) => (nodes.has(ref) ? idOf(ref) : '')
  const placed = new Set<string>()

  function step(ref: string, depth: number): FlowStep | null {
    const n = nodes.get(ref)
    // Conditions only exist under the Start point.
    if (!n || n.kind === 'condition' || depth > MAX_DEPTH) return null
    if (placed.has(ref)) return { id: newId(), kind: 'action', action: { type: 'jump', targetId: idOf(ref) }, next: null }
    placed.add(ref)
    const id = idOf(ref)
    const next = (r: unknown) => step(text(r, 200), depth + 1)
    if (n.kind === 'end') {
      return { id, kind: 'end', end: n.endType === 'human' ? { type: 'human', agents: strings(n.agents).map((a) => a.trim().slice(0, 200)).filter(Boolean).slice(0, 50) } : { type: 'ai', agent: text(n.aiAgent, 200) } }
    }
    if (n.kind === 'buttons') {
      const buttons = records(n.buttons)
        .slice(0, CHAT_FLOW_LIMITS.buttons)
        .map((b) => ({ id: newId(), label: text(b.label, CHAT_FLOW_LIMITS.buttonChars), next: next(b.nextRef) }))
      return { id, kind: 'buttons', message: text(n.message, CHAT_FLOW_LIMITS.message), image: null, buttons, elseId: newId(), elseNext: next(n.elseRef) }
    }
    const act = action(n, targetId)
    return { id, kind: 'action', action: act, next: act.type === 'jump' ? null : next(n.nextRef) }
  }

  const start = raw.start && typeof raw.start === 'object' ? (raw.start as Raw) : {}
  const branches: FlowBranch[] = strings(start.conditionRefs).flatMap((ref) => {
    const n = nodes.get(ref)
    if (!n || n.kind !== 'condition' || placed.has(ref)) return []
    placed.add(ref)
    return [{ id: idOf(ref), condition: condition(n), next: step(text(n.nextRef, 200), 2) }]
  })
  const endRef = text(start.endRef, 200)
  const startStep: FlowStep | null = branches.length
    ? { id: newId(), kind: 'conditions', branches, elseId: newId(), elseNext: step(text(start.elseRef, 200), 2) }
    : nodes.get(endRef)?.kind === 'end'
      ? step(endRef, 1)
      : null
  return { id: newId(), name: text(raw.name, 200), start: startStep }
}

/** The model's flows in the stored shape; flows with neither a name nor a first node are dropped. */
export function chatFlowsFromAi(raw: unknown): ChatFlows {
  const flows = raw && typeof raw === 'object' ? (raw as Raw).flows : undefined
  return {
    flows: records(flows)
      .slice(0, CHAT_FLOW_LIMITS.flows)
      .map(flowFromAi)
      .filter((f) => f.name || f.start),
  }
}
