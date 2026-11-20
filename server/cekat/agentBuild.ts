// Builds the POC's AI agent in Cekat: create it, fill the behavior (welcome message, the three segments, custom
// instructions) and the AI configuration, then read the behavior page back to check every text was saved.
import { customInstructionsOf, splitLegacyBehavior, type BehaviorConfig } from '../../shared/pocBehavior.ts'
import { AGENT_FIELDS } from './selectors.ts'
import type { AgentSettings, AgentUi, Creativity } from './agentUi.ts'

type Log = (text: string) => void

export interface AgentConfigLike extends BehaviorConfig {
  welcomeMessage?: string
  stopAiAfterHandoff?: boolean
  silentAgentHandoff?: boolean
  additionalSettings?: Partial<{
    aiHistoryLimit: number
    aiReadFileLimit: number
    aiContextLimit: number
    aiTemperature: 'low' | 'balanced' | 'creative'
    messageAwait: number
    aiMessageLimit: number
    sessionOnlyMemory: 'off' | 'session_only' | 'per_thread'
    ignoreTeamHandoff: boolean
  }>
}

export interface AgentBuildPlan {
  agentName: string
  fields: { title: string; chars: number }[]
  instructions: string[]
  settings: AgentSettings
  notes: string[]
  problems: string[]
}

export interface AgentBuildResult {
  agentId: string
  url: string
  problems: string[]
}

/** Cekat refuses an AI history limit below 10 and a message wait above 1200 seconds. */
const LIMITS = { historyMin: 10, awaitMax: 1200, instructionTitle: 100 }
const CREATIVITY: Record<'low' | 'balanced' | 'creative', Creativity> = { low: 'Consistent', balanced: 'Balanced', creative: 'Creative' }

const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : fallback)

function texts(config: AgentConfigLike): { title: string; text: string }[] {
  const b = splitLegacyBehavior(config)
  return [
    { title: AGENT_FIELDS.welcome, text: (config.welcomeMessage ?? '').trim() },
    { title: AGENT_FIELDS.communicationStyle, text: b.communicationStyle.trim() },
    { title: AGENT_FIELDS.conversationFlow, text: b.conversationFlow.trim() },
    { title: AGENT_FIELDS.rulesRestrictions, text: b.rulesRestrictions.trim() },
  ].filter((f) => f.text)
}

const instructionsOf = (config: AgentConfigLike) =>
  customInstructionsOf(config)
    .filter((c) => c.content.trim())
    .map((c, i) => ({ title: (c.title.trim() || `Instruction ${i + 1}`).slice(0, LIMITS.instructionTitle), text: c.content.trim() }))

export function settingsOf(config: AgentConfigLike): { settings: AgentSettings; notes: string[] } {
  const s = config.additionalSettings ?? {}
  const notes: string[] = []
  let historyLimit = int(s.aiHistoryLimit, 20)
  if (historyLimit < LIMITS.historyMin) {
    notes.push(`AI History Limit ${historyLimit} is raised to ${LIMITS.historyMin}, the lowest Cekat accepts.`)
    historyLimit = LIMITS.historyMin
  }
  let messageAwait = int(s.messageAwait, 5)
  if (messageAwait > LIMITS.awaitMax) {
    notes.push(`Message Await ${messageAwait}s is lowered to ${LIMITS.awaitMax}s, the highest Cekat accepts.`)
    messageAwait = LIMITS.awaitMax
  }
  return {
    settings: {
      stopAiAfterTransfer: !!config.stopAiAfterHandoff,
      silentTransfer: !!config.silentAgentHandoff,
      ignoreTeamHandoff: !!s.ignoreTeamHandoff,
      historyLimit,
      readFileLimit: int(s.aiReadFileLimit, 3),
      contextLimit: int(s.aiContextLimit, 10),
      creativity: CREATIVITY[s.aiTemperature ?? 'balanced'] ?? 'Balanced',
      messageAwait,
      messageLimit: int(s.aiMessageLimit, 1000),
      sessionOnlyMemory: !!s.sessionOnlyMemory && s.sessionOnlyMemory !== 'off',
    },
    notes,
  }
}

export function planAgentBuild(name: string, config: AgentConfigLike, exists: boolean): AgentBuildPlan {
  const fields = texts(config)
  const instructions = instructionsOf(config)
  const { settings, notes } = settingsOf(config)
  const problems: string[] = []
  if (!name.trim()) problems.push('The AI agent needs a name.')
  else if (exists) problems.push(`An AI agent named "${name.trim()}" already exists in this Cekat business. Use another name or remove the old one first.`)
  if (!fields.some((f) => f.title !== AGENT_FIELDS.welcome)) problems.push('The AI Agent Behavior is empty: fill Communication Style, Conversation Flow or Rules & Restrictions first.')
  notes.push('Knowledge base and API integrations are not created yet; set them up in Cekat.')
  return { agentName: name.trim(), fields: fields.map((f) => ({ title: f.title, chars: f.text.length })), instructions: instructions.map((i) => i.title), settings, notes, problems }
}

/** Compares without whitespace differences: the editor may turn line breaks into paragraphs. */
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Texts the behavior page does not show back; checked on a window of each text so long ones still match. */
export function missingTexts(page: string, items: { title: string; text: string }[]): string[] {
  const shown = squash(page)
  return items.filter((i) => !shown.includes(squash(i.text).slice(0, 120))).map((i) => i.title)
}

export async function runAgentBuild(ui: AgentUi, name: string, config: AgentConfigLike, log: Log): Promise<AgentBuildResult> {
  const plan = planAgentBuild(name, config, await ui.hasAgent(name.trim()))
  if (plan.problems.length) throw new Error(plan.problems.join(' '))

  log(`Creating AI agent "${plan.agentName}"…`)
  const agentId = await ui.createAgent(plan.agentName)
  const fields = texts(config)
  for (const f of fields) {
    log(`Filling ${f.title} (${f.text.length} characters)…`)
    await ui.fillField(agentId, f.title, f.text)
  }
  const instructions = instructionsOf(config)
  for (const i of instructions) {
    log(`Adding instruction "${i.title}"…`)
    await ui.addInstruction(agentId, i.title, i.text)
  }
  log('Applying the AI configuration…')
  await ui.applySettings(agentId, plan.settings)

  log('Checking the agent in Cekat…')
  const missing = missingTexts(await ui.behaviorText(agentId), [...fields, ...instructions])
  const problems = [...missing.map((t) => `"${t}" was not found on the agent's behavior page after saving; check it in Cekat.`), ...plan.notes]
  return { agentId, url: `https://chat.cekat.ai/ai-agents-v2/${agentId}?tab=behavior`, problems }
}
