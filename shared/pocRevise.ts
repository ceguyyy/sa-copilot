// "Revise with AI" targets inside a POC: a whole section (category) or one long text field. The server
// proposes a new value; the UI shows the diff and applies it to the unsaved draft only when accepted.

export const POC_REVISE_SECTIONS = ['agent', 'labels', 'pipeline', 'knowledgeBase', 'apiIntegrations', 'crm', 'flow'] as const
export const POC_REVISE_FIELDS = ['agentBehavior', 'welcomeMessage', 'agentTransferConditions', 'kbTextContent', 'qnaAnswer', 'apiDescription'] as const

export type PocReviseSection = (typeof POC_REVISE_SECTIONS)[number]
export type PocReviseField = (typeof POC_REVISE_FIELDS)[number]

export type PocReviseTarget = { kind: 'section'; section: PocReviseSection } | { kind: 'field'; field: PocReviseField; index?: number }

export const SECTION_LABELS: Record<PocReviseSection, string> = {
  agent: 'AI Agent Behavior (behavior, welcome message, handoff)',
  labels: 'AI Action — Labels',
  pipeline: 'Conversation Pipeline',
  knowledgeBase: 'Knowledge Base',
  apiIntegrations: 'API Integrations',
  crm: 'CRM Structure',
  flow: 'Flow & Happy Case',
}

export const FIELD_LABELS: Record<PocReviseField, string> = {
  agentBehavior: 'AI Agent Behavior',
  welcomeMessage: 'Welcome Message',
  agentTransferConditions: 'Agent Transfer Conditions',
  kbTextContent: 'Knowledge text',
  qnaAnswer: 'Q&A answer',
  apiDescription: 'API description',
}

/** The parts of a POC config the field targets read and write. */
export interface ReviseFieldConfig {
  agentBehavior: string
  welcomeMessage: string
  agentTransferConditions: string
  knowledgeBase: { textSections: { title: string; content: string }[]; qna: { question: string; answer: string }[] }
  apiIntegrations: { name: string; description: string }[]
}

type FieldTarget = Extract<PocReviseTarget, { kind: 'field' }>

export function fieldText(config: ReviseFieldConfig, target: FieldTarget): string {
  const i = target.index ?? -1
  switch (target.field) {
    case 'agentBehavior':
    case 'welcomeMessage':
    case 'agentTransferConditions':
      return config[target.field]
    case 'kbTextContent':
      return config.knowledgeBase.textSections[i]?.content ?? ''
    case 'qnaAnswer':
      return config.knowledgeBase.qna[i]?.answer ?? ''
    case 'apiDescription':
      return config.apiIntegrations[i]?.description ?? ''
  }
}

const replaceAt = <T>(items: T[], index: number, patch: Partial<T>): T[] => items.map((item, i) => (i === index ? { ...item, ...patch } : item))

/** A copy of the config with the target field set to `text`; unchanged when the item was removed meanwhile. */
export function withFieldText<C extends ReviseFieldConfig>(config: C, target: FieldTarget, text: string): C {
  const i = target.index ?? -1
  const kb = config.knowledgeBase
  switch (target.field) {
    case 'agentBehavior':
    case 'welcomeMessage':
    case 'agentTransferConditions':
      return { ...config, [target.field]: text }
    case 'kbTextContent':
      if (!kb.textSections[i]) return config
      return { ...config, knowledgeBase: { ...kb, textSections: replaceAt(kb.textSections, i, { content: text }) } }
    case 'qnaAnswer':
      if (!kb.qna[i]) return config
      return { ...config, knowledgeBase: { ...kb, qna: replaceAt(kb.qna, i, { answer: text }) } }
    case 'apiDescription':
      if (!config.apiIntegrations[i]) return config
      return { ...config, apiIntegrations: replaceAt(config.apiIntegrations, i, { description: text }) }
  }
}

/** Which item a per-item field belongs to, e.g. the Q&A question or the API name. */
function itemName(config: ReviseFieldConfig, target: FieldTarget): string {
  const i = target.index ?? -1
  if (target.field === 'kbTextContent') return config.knowledgeBase.textSections[i]?.title ? `"${config.knowledgeBase.textSections[i].title}"` : ''
  if (target.field === 'qnaAnswer') return config.knowledgeBase.qna[i]?.question ? `"${config.knowledgeBase.qna[i].question}"` : ''
  if (target.field === 'apiDescription') return config.apiIntegrations[i]?.name ?? ''
  return ''
}

export function reviseTargetLabel(config: ReviseFieldConfig, target: PocReviseTarget): string {
  if (target.kind === 'section') return SECTION_LABELS[target.section]
  const item = itemName(config, target)
  return item ? `${FIELD_LABELS[target.field]} — ${item}` : FIELD_LABELS[target.field]
}

export function isSameTarget(a: PocReviseTarget | null | undefined, b: PocReviseTarget): boolean {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === 'section') return b.kind === 'section' && a.section === b.section
  return b.kind === 'field' && a.field === b.field && (a.index ?? -1) === (b.index ?? -1)
}
