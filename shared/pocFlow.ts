// POC conversation flowchart (Mermaid) and happy cases: step-by-step scenarios to try the agent in Cekat.

export type HappyCaseStep = { user: string; ai: string; action: string }
export type HappyCase = { title: string; goal: string; steps: HappyCaseStep[] }
export type PocFlow = { mermaid: string; happyCases: HappyCase[] }

export const emptyFlow = (): PocFlow => ({ mermaid: '', happyCases: [] })

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])

/** Mermaid source without the ``` fences a model may wrap around it. */
export function cleanMermaid(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:mermaid)?\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim()
}

function happyCaseFromAi(raw: Record<string, unknown>): HappyCase {
  return {
    title: text(raw.title),
    goal: text(raw.goal),
    steps: records(raw.steps)
      .map((s) => ({ user: text(s.user), ai: text(s.ai), action: text(s.action) }))
      .filter((s) => s.user || s.ai || s.action),
  }
}

/** The model's flowchart and happy cases in the stored shape; cases without a title or steps are dropped. */
export function flowFromAi(raw: unknown): PocFlow {
  if (!raw || typeof raw !== 'object') return emptyFlow()
  const r = raw as Record<string, unknown>
  return {
    mermaid: cleanMermaid(text(r.flowchart)),
    happyCases: records(r.happyCases)
      .map(happyCaseFromAi)
      .filter((c) => c.title && c.steps.length),
  }
}

/** POCs saved before the flow existed get an empty one. */
export function normalizeFlow(flow: PocFlow | undefined): PocFlow {
  return flow ? { mermaid: flow.mermaid ?? '', happyCases: flow.happyCases ?? [] } : emptyFlow()
}

/** A numbered test script: what to type in the Cekat chat and what should happen after each message. */
export function happyCaseScript(c: HappyCase): string {
  const head = [`Happy case: ${c.title}`, ...(c.goal ? [`Goal: ${c.goal}`] : [])]
  const steps = c.steps.map((s, i) =>
    [`${i + 1}. User: ${s.user}`, ...(s.ai ? [`   Expected AI: ${s.ai}`] : []), ...(s.action ? [`   Expected action: ${s.action}`] : [])].join('\n'),
  )
  return [head.join('\n'), ...steps].join('\n\n')
}
