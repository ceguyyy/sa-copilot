// "Build in Cekat": previews (JSON) and builds (NDJSON progress streams) for a POC's CRM boards and AI agent.
import { send } from './api'
import type { CrmBoard, PocConfig } from './types'

export type CrmBuildPlan = { boardName: string; keyName: string; columns: { name: string; typeLabel: string; kind: 'select' | 'dropdown'; options: string[] }[]; sampleItems: number; problems: string[] }
export type CrmBuildResult = { boardId: string; url: string; createdItems: number; problems: string[] }

export type AgentBuildPlan = {
  agentName: string
  fields: { title: string; chars: number }[]
  instructions: string[]
  settings: Record<string, boolean | number | string>
  notes: string[]
  problems: string[]
  routing: { transfer: string | null; labels: { title: string }[]; moves: { title: string }[]; problems: string[] }
  kb: { textChars: number; qna: number; manual: string[] }
  tools: { names: string[]; problems: string[] }
}
export type AgentBuildResult = {
  agentId: string
  url: string
  kbQna: number
  createdLabels: string[]
  createdStatuses: string[]
  conditions: number
  apiTools: string[]
  problems: string[]
}

type BuildEvent<T> = { type: 'status'; text: string } | { type: 'result'; data: T } | { type: 'done' } | { type: 'error'; error: string }

/** Posts a build and reads its NDJSON progress; resolves with the result, rejects on the first failure. */
async function streamBuild<T>(path: string, body: unknown, onStatus: (text: string) => void): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(`Build in Cekat: ${err.error ?? res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: T | null = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as BuildEvent<T>
      if (event.type === 'error') throw new Error(event.error)
      if (event.type === 'status') onStatus(event.text)
      if (event.type === 'result') result = event.data
    }
  }
  if (!result) throw new Error('The build stopped before it finished (server stopped?).')
  return result
}

export const previewCrmBuild = (pocId: string, board: CrmBoard) => send<CrmBuildPlan>('Preview Build in Cekat', 'POST', `/pocs/${pocId}/cekat/crm/preview`, { board })
export const buildCrmInCekat = (pocId: string, board: CrmBoard, onStatus: (text: string) => void) =>
  streamBuild<CrmBuildResult>(`/pocs/${pocId}/cekat/crm/build`, { board }, onStatus)

export const previewAgentBuild = (pocId: string, config: PocConfig, name: string) =>
  send<AgentBuildPlan>('Preview AI agent build', 'POST', `/pocs/${pocId}/cekat/agent/preview`, { config, name })
export const buildAgentInCekat = (pocId: string, config: PocConfig, name: string, onStatus: (text: string) => void) =>
  streamBuild<AgentBuildResult>(`/pocs/${pocId}/cekat/agent/build`, { config, name }, onStatus)
