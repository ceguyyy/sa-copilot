// One copyable prompt with every POC AI action (label, pipeline status, tool, handoff) and when it applies.

type Named = { name: string; condition: string }

export type AiActionsInput = {
  labels: Named[]
  pipeline: { order: number; status: string; condition: string }[]
  apiIntegrations: { name: string; description: string }[]
  agentTransferConditions: string
}

const line = (name: string, condition: string, empty: string) => `- ${name.trim()} -> ${condition.trim() || empty}`

function section(title: string, lines: string[]): string[] {
  return lines.length ? [`## ${title}`, ...lines] : []
}

export function aiActionsPrompt(poc: AiActionsInput): string {
  const labels = poc.labels.filter((l) => l.name.trim()).map((l) => line(l.name, l.condition, '(no condition yet)'))
  const pipeline = [...poc.pipeline]
    .filter((s) => s.status.trim())
    .sort((a, b) => a.order - b.order)
    .map((s, i) => line(`${s.order}. ${s.status}`, s.condition, i === 0 ? '(first status)' : '(no condition yet)'))
  const tools = poc.apiIntegrations.filter((t) => t.name.trim()).map((t) => line(t.name, t.description, '(no description yet)'))
  const handoff = poc.agentTransferConditions.trim()

  return [section('Labels', labels), section('Pipeline', pipeline), section('Tools', tools), handoff ? ['## Agent handoff', handoff] : []]
    .filter((s) => s.length)
    .map((s) => s.join('\n'))
    .join('\n\n')
}
