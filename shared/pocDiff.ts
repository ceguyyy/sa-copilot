// Compares two POC configs section by section (for the POC version history). Each section is rendered to
// stable text so a line diff shows what changed; API keys and embedded image data are never shown.
import { flowOutline, normalizeChatFlows } from './pocChatFlow.ts'
import { happyCaseScript, type HappyCase } from './pocFlow.ts'
import { type LegacyWorkflow, type PocN8nCase, workflowCases } from './pocN8n.ts'

export const POC_SECTIONS = [
  { key: 'behavior', label: 'AI Agent Behavior' },
  { key: 'welcome', label: 'Welcome message & image' },
  { key: 'handoff', label: 'Agent handoff' },
  { key: 'labels', label: 'Labels' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'knowledge', label: 'Knowledge base' },
  { key: 'api', label: 'API integrations' },
  { key: 'crm', label: 'CRM' },
  { key: 'flow', label: 'Flow & happy cases' },
  { key: 'n8n', label: 'n8n workflows' },
  { key: 'chatFlows', label: 'POC Flow' },
  { key: 'settings', label: 'Additional settings' },
] as const

export type PocSectionKey = (typeof POC_SECTIONS)[number]['key']

export interface PocChange {
  key: PocSectionKey
  label: string
  before: string
  after: string
}

/** Loose on purpose: versions saved by older releases miss newer fields. */
type LooseConfig = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])
const pretty = (v: unknown) => JSON.stringify(v ?? null, null, 2)

/** Short fingerprint so two different embedded images never render the same text. */
function fingerprint(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

function imageText(v: unknown): string {
  const image = str(v)
  if (!image) return 'Welcome image: none'
  if (!image.startsWith('data:')) return `Welcome image: ${image}`
  const kb = Math.round(((image.length - image.indexOf(',') - 1) * 3) / 4 / 1024)
  return `Welcome image: embedded image (${kb} KB, #${fingerprint(image)})`
}

function apiText(v: unknown): string {
  return list(v)
    .map(({ apiKey, ...rest }) => `${pretty(rest)}\napiKey: ${str(apiKey) ? 'set' : 'none'}`)
    .join('\n\n')
}

function flowText(v: unknown): string {
  const flow = (v && typeof v === 'object' ? v : {}) as { mermaid?: unknown; happyCases?: unknown }
  const cases = list(flow.happyCases).map((c) => happyCaseScript({ title: str(c.title), goal: str(c.goal), steps: list(c.steps) as unknown as HappyCase['steps'] }))
  return [str(flow.mermaid), ...cases].filter(Boolean).join('\n\n')
}

const caseText = (c: PocN8nCase) => `### ${c.action}${c.title ? ` — ${c.title}` : ''}\n${c.curl}`

function n8nText(v: unknown): string {
  const workflows = list(v && typeof v === 'object' ? (v as { workflows?: unknown }).workflows : undefined)
  return workflows
    .map((w) =>
      [`## ${str(w.name)}`, str(w.description), str(w.json), ...workflowCases(w as LegacyWorkflow).map(caseText), str(w.testNotes)].filter(Boolean).join('\n'),
    )
    .join('\n\n')
}

/** Every section of a POC config as comparable text. */
export function pocSectionTexts(config: LooseConfig): Record<PocSectionKey, string> {
  return {
    behavior: str(config.agentBehavior),
    welcome: [str(config.welcomeMessage), imageText(config.welcomeImage)].join('\n\n'),
    handoff: [
      str(config.agentTransferConditions),
      `Stop AI after handoff: ${config.stopAiAfterHandoff ? 'yes' : 'no'}`,
      `Silent agent handoff: ${config.silentAgentHandoff ? 'yes' : 'no'}`,
    ].join('\n'),
    labels: list(config.labels).map((l) => `${str(l.name)} -> ${str(l.condition)}`).join('\n'),
    pipeline: list(config.pipeline).map((p) => `${String(p.order ?? '')}. ${str(p.status)} -> ${str(p.condition)}`).join('\n'),
    knowledge: pretty(config.knowledgeBase ?? {}),
    api: apiText(config.apiIntegrations),
    crm: pretty(config.crm ?? { boards: [] }),
    flow: flowText(config.flow),
    n8n: n8nText(config.n8n),
    chatFlows: normalizeChatFlows(config.chatFlows).flows.map(flowOutline).join('\n\n'),
    settings: pretty(config.additionalSettings ?? {}),
  }
}

/** Sections whose text differs between two configs, in display order. */
export function pocChanges(before: LooseConfig, after: LooseConfig): PocChange[] {
  const a = pocSectionTexts(before)
  const b = pocSectionTexts(after)
  return POC_SECTIONS.filter((s) => a[s.key] !== b[s.key]).map((s) => ({ key: s.key, label: s.label, before: a[s.key], after: b[s.key] }))
}
