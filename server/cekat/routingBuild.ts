// The POC's routing on a Cekat AI agent: missing labels are created in Settings › Labels, then one condition per
// label, one agent transfer condition, and a pipeline condition per status move. Missing pipeline statuses are
// created in Settings › Pipeline Statuses first, in the POC's order.
import type { RoutingUi } from './routingUi.ts'

type Log = (text: string) => void

export interface RoutingConfigLike {
  agentTransferConditions?: string
  labels?: { name?: unknown; condition?: unknown }[]
  pipeline?: { order?: unknown; status?: unknown; condition?: unknown }[]
}

/** Cekat limits: names and titles up to 100 characters, 30 conditions per section. */
export const ROUTING_LIMITS = { name: 100, conditions: 30 }

export interface PlannedLabel { title: string; label: string; description: string }
export interface PlannedMove { title: string; current: string | null; target: string; description: string }
export interface RoutingPlan {
  transfer: string | null
  labels: PlannedLabel[]
  moves: PlannedMove[]
  problems: string[]
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** What the POC asks for, before looking at Cekat. */
export function planRouting(config: RoutingConfigLike): RoutingPlan {
  const problems: string[] = []
  const labels: PlannedLabel[] = []
  for (const l of config.labels ?? []) {
    const name = text(l.name)
    if (!name) continue
    if (name.length > ROUTING_LIMITS.name) {
      problems.push(`Label "${name.slice(0, 40)}…" is longer than ${ROUTING_LIMITS.name} characters, Cekat's limit; it is skipped.`)
      continue
    }
    labels.push({ title: name, label: name, description: text(l.condition) || `Apply when the conversation is about ${name}.` })
  }
  const statuses = [...(config.pipeline ?? [])]
    .map((p) => ({ order: typeof p.order === 'number' ? p.order : 0, status: text(p.status), condition: text(p.condition) }))
    .filter((p) => p.status)
    .sort((a, b) => a.order - b.order)
  const moves: PlannedMove[] = []
  statuses.forEach((p, i) => {
    // The first status is where conversations start; it only gets a condition when the POC gave one.
    if (i === 0 && !p.condition) return
    const current = i === 0 ? null : statuses[i - 1].status
    moves.push({ title: `${current ? `${current} → ` : ''}${p.status}`.slice(0, ROUTING_LIMITS.name), current, target: p.status, description: p.condition || `Move here once the conversation reaches ${p.status}.` })
  })
  for (const [what, list] of [['label', labels], ['pipeline', moves]] as const) {
    if (list.length > ROUTING_LIMITS.conditions) problems.push(`Cekat allows ${ROUTING_LIMITS.conditions} ${what} conditions; only the first ${ROUTING_LIMITS.conditions} are added.`)
  }
  return {
    transfer: text(config.agentTransferConditions) || null,
    labels: labels.slice(0, ROUTING_LIMITS.conditions),
    moves: moves.slice(0, ROUTING_LIMITS.conditions),
    problems,
  }
}

const norm = (s: string) => s.trim().toLowerCase()

export interface RoutingResult { createdLabels: string[]; createdStatuses: string[]; conditions: number; problems: string[] }

export async function runRoutingBuild(ui: RoutingUi, agentId: string, config: RoutingConfigLike, log: Log): Promise<RoutingResult> {
  const plan = planRouting(config)
  const problems = [...plan.problems]
  const createdLabels: string[] = []
  const createdStatuses: string[] = []
  const titles: string[] = []

  if (plan.labels.length) {
    const existing = new Set((await ui.labelNames()).map(norm))
    for (const l of plan.labels) {
      if (existing.has(norm(l.label))) continue
      log(`Creating label "${l.label}"…`)
      await ui.createLabel(l.label)
      existing.add(norm(l.label))
      createdLabels.push(l.label)
    }
  }
  if (plan.transfer) {
    log('Adding the agent transfer condition…')
    await ui.addTransferCondition(agentId, 'Agent transfer', plan.transfer)
    titles.push('Agent transfer')
  }
  for (const l of plan.labels) {
    log(`Adding label condition "${l.title}"…`)
    await ui.addLabelCondition(agentId, l.title, l.label, l.description)
    titles.push(l.title)
  }
  if (plan.moves.length) {
    const statuses = new Set((await ui.pipelineNames(agentId)).map(norm))
    for (const name of plan.moves.flatMap((m) => [m.current, m.target])) {
      if (!name || statuses.has(norm(name))) continue
      log(`Creating pipeline status "${name}"…`)
      await ui.createPipelineStatus(name)
      statuses.add(norm(name))
      createdStatuses.push(name)
    }
    for (const m of plan.moves) {
      log(`Adding pipeline condition "${m.title}"…`)
      await ui.addPipelineCondition(agentId, m.title, m.current, m.target, m.description)
      titles.push(m.title)
    }
  }

  if (titles.length) {
    log('Checking the conditions in Cekat…')
    const page = (await ui.routingText(agentId)).toLowerCase()
    for (const t of titles) if (!page.includes(t.toLowerCase())) problems.push(`Condition "${t}" was not found on the agent's AI Actions & Routing page after saving; check it in Cekat.`)
  }
  return { createdLabels, createdStatuses, conditions: titles.length, problems }
}
