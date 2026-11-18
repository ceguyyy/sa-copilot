// The AI Agent Behavior prompt is edited in segments (communication style, conversation flow, rules and
// restrictions, and any number of custom instructions) and composed into one markdown prompt for Cekat.
// POCs saved before the split only have the legacy single `agentBehavior` text.

export const BEHAVIOR_LIMITS = {
  communicationStyle: 5_000,
  conversationFlow: 8_000,
  rulesRestrictions: 3_000,
  customInstruction: 2_000,
  customInstructionTitle: 120,
} as const

export const MAX_CUSTOM_INSTRUCTIONS = 20

export type BehaviorSegment = 'communicationStyle' | 'conversationFlow' | 'rulesRestrictions'

export const BEHAVIOR_SEGMENTS: { key: BehaviorSegment; label: string; hint: string }[] = [
  { key: 'communicationStyle', label: 'Communication Style', hint: 'Identity, persona, tone, language and reply format of the AI.' },
  { key: 'conversationFlow', label: 'Conversation Flow', hint: 'How the AI guides the chat step by step: greeting, intent detection, the main flows and when to call tools.' },
  { key: 'rulesRestrictions', label: 'Rules & Restrictions', hint: 'What the AI must always or never do, limits and things it must not answer.' },
]

export type CustomInstruction = { title: string; content: string }

export interface BehaviorConfig {
  agentBehavior?: string
  communicationStyle?: string
  conversationFlow?: string
  rulesRestrictions?: string
  customInstructions?: CustomInstruction[]
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function customInstructionsOf(config: BehaviorConfig): CustomInstruction[] {
  const list = Array.isArray(config.customInstructions) ? config.customInstructions : []
  return list.filter((c) => c && typeof c === 'object').map((c) => ({ title: str(c.title), content: str(c.content) }))
}

/** True when any of the split segments has text. */
export function hasBehaviorSegments(config: BehaviorConfig): boolean {
  return BEHAVIOR_SEGMENTS.some(({ key }) => str(config[key]).trim() !== '') || customInstructionsOf(config).some((c) => c.content.trim() !== '')
}

/** The full AI Agent Behavior prompt: the segments as markdown sections, or the legacy text for old POCs. */
export function composeAgentBehavior(config: BehaviorConfig): string {
  if (!hasBehaviorSegments(config)) return str(config.agentBehavior).trim()
  const parts = BEHAVIOR_SEGMENTS.map(({ key, label }) => [label, str(config[key]).trim()] as const)
  const custom = customInstructionsOf(config).map((c, i) => [c.title.trim() || `Custom Instruction ${i + 1}`, c.content.trim()] as const)
  return [...parts, ...custom]
    .filter(([, text]) => text)
    .map(([title, text]) => `## ${title}\n\n${text}`)
    .join('\n\n')
}

/**
 * A config in the split shape: a legacy POC's single behavior text moves into Conversation Flow (the
 * largest segment) so nothing is lost; the SA can then move parts of it into the other segments.
 */
export function splitLegacyBehavior<C extends BehaviorConfig>(config: C): C & SplitBehavior {
  const base = {
    ...config,
    communicationStyle: str(config.communicationStyle),
    conversationFlow: str(config.conversationFlow),
    rulesRestrictions: str(config.rulesRestrictions),
    customInstructions: customInstructionsOf(config),
    agentBehavior: '',
  }
  const legacy = str(config.agentBehavior)
  if (hasBehaviorSegments(base) || !legacy.trim()) return base
  return { ...base, conversationFlow: legacy }
}

export type SplitBehavior = Required<BehaviorConfig>

const clamp = (v: unknown, max: number) => str(v).slice(0, max)

/** The segments from model output, cut to their limits so the result always validates. */
export function behaviorFromAi(raw: Record<string, unknown>): Required<Omit<BehaviorConfig, 'agentBehavior'>> {
  const custom = Array.isArray(raw.customInstructions) ? (raw.customInstructions as Record<string, unknown>[]) : []
  return {
    communicationStyle: clamp(raw.communicationStyle, BEHAVIOR_LIMITS.communicationStyle),
    conversationFlow: clamp(raw.conversationFlow, BEHAVIOR_LIMITS.conversationFlow),
    rulesRestrictions: clamp(raw.rulesRestrictions, BEHAVIOR_LIMITS.rulesRestrictions),
    customInstructions: custom
      .filter((c) => c && typeof c === 'object')
      .map((c) => ({ title: clamp(c.title, BEHAVIOR_LIMITS.customInstructionTitle), content: clamp(c.content, BEHAVIOR_LIMITS.customInstruction) }))
      .filter((c) => c.content.trim())
      .slice(0, MAX_CUSTOM_INSTRUCTIONS),
  }
}
