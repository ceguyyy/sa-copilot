// The POC knowledge base on a Cekat AI agent: the static text sections as one "Default" text (each under its own
// heading) and the Q&A pairs. Websites and uploaded files are listed for the SA to add in Cekat.
import type { KbUi, QnaPair } from './kbUi.ts'

type Log = (text: string) => void

export interface KbConfigLike {
  knowledgeBase?: {
    textSections?: { title?: unknown; content?: unknown }[]
    websites?: { url?: unknown }[]
    qna?: { question?: unknown; answer?: unknown }[]
    files?: { name?: unknown }[]
  }
}

export interface KbPlan { text: string; qna: QnaPair[]; manual: string[] }
export interface KbResult { textChars: number; qna: number; problems: string[] }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function planKb(config: KbConfigLike): KbPlan {
  const kb = config.knowledgeBase ?? {}
  const text = (kb.textSections ?? [])
    .map((s) => ({ title: str(s.title), content: str(s.content) }))
    .filter((s) => s.content)
    .map((s) => (s.title ? `## ${s.title}\n${s.content}` : s.content))
    .join('\n\n')
  const qna = (kb.qna ?? []).map((q) => ({ question: str(q.question), answer: str(q.answer) })).filter((q) => q.question && q.answer)
  const websites = (kb.websites ?? []).map((w) => str(w.url)).filter(Boolean)
  const files = (kb.files ?? []).map((f) => str(f.name)).filter(Boolean)
  const manual = [
    ...(websites.length ? [`Add the website(s) in Knowledge Base › Website (Cekat crawls and trains on them): ${websites.join(', ')}`] : []),
    ...(files.length ? [`Upload the file(s) in Knowledge Base › File: ${files.join(', ')}`] : []),
  ]
  return { text, qna, manual }
}

/** Compares without whitespace differences: each line becomes a paragraph in the editor. */
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

export async function runKbBuild(ui: KbUi, agentId: string, config: KbConfigLike, log: Log): Promise<KbResult> {
  const plan = planKb(config)
  const problems = [...plan.manual]
  if (plan.text) {
    log(`Filling the knowledge base text (${plan.text.length} characters)…`)
    await ui.fillText(agentId, plan.text)
  }
  if (plan.qna.length) {
    log(`Adding ${plan.qna.length} Q&A pair(s)…`)
    await ui.addQna(agentId, plan.qna)
  }
  if (plan.text || plan.qna.length) {
    log('Checking the knowledge base in Cekat…')
    const saved = await ui.read(agentId)
    if (plan.text && !squash(saved.text).includes(squash(plan.text).slice(0, 200))) problems.push('The knowledge base text was not found after saving; check Knowledge Base › Text in Cekat.')
    const questions = new Set(saved.qna.map((q) => squash(q.question)))
    for (const q of plan.qna) if (!questions.has(squash(q.question))) problems.push(`Q&A "${q.question}" was not found after saving; check Knowledge Base › Q&A in Cekat.`)
  }
  return { textChars: plan.text.length, qna: plan.qna.length, problems }
}
