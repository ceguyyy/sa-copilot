// The whole project as one Markdown file: project facts, every deliverable (latest version), diagrams,
// client questions and POCs — for "Download MD" and for pasting into Notion or other tools.
import { mdTable, toMarkdown } from './docMarkdown.ts'
import { normalizeCrm } from './pocCrm.ts'
import { DOC_LABELS, PIPELINE, type AnyDocContent, type DocType } from './schemas.ts'

export interface ProjectInfo {
  name: string
  client_name: string
  industry: string | null
  package: string | null
  status: string
  language: string | null
  description: string | null
}

export interface ProjectDoc {
  type: DocType
  title: string
  version: number
  updated_at: string
  content: AnyDocContent
}

export interface ProjectQuestion {
  question: string
  status: 'open' | 'answered' | 'dropped'
  answer: string
}

export interface ProjectPoc {
  name: string
  config: Record<string, unknown>
}

/** Pushes every heading `levels` down (max h6, outside code fences) so nested content stays below its section. */
export function demoteHeadings(markdown: string, levels = 1): string {
  let inFence = false
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inFence = !inFence
      const match = inFence ? null : /^(#{1,6}) (.*)$/.exec(line)
      return match ? `${'#'.repeat(Math.min(6, match[1].length + levels))} ${match[2]}` : line
    })
    .join('\n')
}

const anchor = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    // GitHub/Notion style: every space becomes "-" (not collapsed), so "A — B" → "a--b".
    .replace(/\s/g, '-')

/** Pipeline deliverables first (in order), then custom deliverables, then diagrams. */
function orderDocs(docs: ProjectDoc[]): ProjectDoc[] {
  const rank = (d: ProjectDoc) => {
    const i = PIPELINE.indexOf(d.type)
    return i >= 0 ? i : d.type === 'custom' ? PIPELINE.length : PIPELINE.length + 1
  }
  return [...docs].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
}

function pocMarkdown(poc: ProjectPoc): string {
  const c = poc.config
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  const out = [`### ${poc.name}`]
  // Free-form markdown written by the SA/AI: its own headings must sit below "#### AI Agent Behavior".
  if (text(c.agentBehavior)) out.push(`#### AI Agent Behavior\n\n${demoteHeadings(text(c.agentBehavior), 4)}`)
  if (text(c.welcomeMessage)) out.push(`#### Welcome Message\n\n${text(c.welcomeMessage)}`)
  if (text(c.agentTransferConditions)) out.push(`#### Agent Transfer Conditions\n\n${text(c.agentTransferConditions)}`)
  const labels = list(c.labels)
  if (labels.length) out.push(`#### Labels\n\n${mdTable(['Label', 'Condition'], labels.map((l) => [l.name, l.condition]))}`)
  const apis = list(c.apiIntegrations)
  if (apis.length) {
    out.push(
      `#### API Integrations\n\n${mdTable(
        ['Name', 'Method', 'Webhook', 'Target', 'Description'],
        apis.map((a) => [a.name, a.httpMethod, a.webhookAddress, [a.targetMethod, a.targetUrl].filter(Boolean).join(' '), a.description]),
      )}`,
    )
  }
  for (const board of normalizeCrm(c.crm).boards) {
    out.push(`#### CRM board: ${board.name || 'Untitled'}${board.description ? `\n\n${board.description}` : ''}`)
    out.push(mdTable(board.columns.map((col) => `${col.name} (${col.type})`), board.rows.map((row) => board.columns.map((col) => row[col.key] ?? ''))))
  }
  return out.join('\n\n')
}

export function projectMarkdown(project: ProjectInfo, docs: ProjectDoc[], questions: ProjectQuestion[], pocs: ProjectPoc[], exportedAt = new Date()): string {
  const ordered = orderDocs(docs)
  // "TOR" titled "TOR" stays "TOR"; otherwise the type follows the title ("Alur Booking — Diagram").
  const heading = (d: ProjectDoc) => (d.title.trim().toLowerCase() === DOC_LABELS[d.type].toLowerCase() ? d.title.trim() : `${d.title} — ${DOC_LABELS[d.type]}`)
  const facts = mdTable(
    ['Field', 'Value'],
    [
      ['Client', project.client_name],
      ['Industry', project.industry ?? '-'],
      ['Package', project.package ?? '-'],
      ['Status', project.status],
      ['Language', project.language ?? '-'],
      ['Exported', exportedAt.toISOString().slice(0, 10)],
    ],
  )
  const answered = questions.filter((q) => q.status === 'answered')
  const open = questions.filter((q) => q.status === 'open')

  const toc = [
    ...ordered.map((d) => `- [${heading(d)}](#${anchor(heading(d))})`),
    ...(answered.length || open.length ? ['- [Client questions](#client-questions)'] : []),
    ...(pocs.length ? ['- [POC](#poc)'] : []),
  ]

  const parts = [`# ${project.name}`, facts]
  if (project.description?.trim()) parts.push(project.description.trim())
  if (toc.length) parts.push(`## Contents\n\n${toc.join('\n')}`)
  for (const d of ordered) {
    const body = demoteHeadings(toMarkdown(d.type, heading(d), d.content))
    parts.push(`${body}\n\n_v${d.version} · updated ${d.updated_at.slice(0, 10)}_`)
  }
  if (answered.length || open.length) {
    parts.push('## Client questions')
    if (answered.length) parts.push(`### Answered\n\n${mdTable(['Question', 'Answer'], answered.map((q) => [q.question, q.answer]))}`)
    if (open.length) parts.push(`### Open\n\n${open.map((q) => `- ${q.question.replace(/\n/g, ' ')}`).join('\n')}`)
  }
  if (pocs.length) parts.push('## POC', ...pocs.map(pocMarkdown))
  return `${parts.join('\n\n')}\n`
}
