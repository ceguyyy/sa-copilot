// "Build in Cekat": preview (JSON) and the build itself (NDJSON progress stream) for one POC CRM board.
import { send } from './api'
import type { CrmBoard } from './types'

export type CrmBuildPlan = { boardName: string; keyName: string; columns: { name: string; typeLabel: string; kind: 'select' | 'dropdown'; options: string[] }[]; sampleItems: number; problems: string[] }
export type CrmBuildResult = { boardId: string; url: string; createdItems: number; problems: string[] }

type BuildEvent = { type: 'status'; text: string } | { type: 'result'; data: CrmBuildResult } | { type: 'done' } | { type: 'error'; error: string }

export const previewCrmBuild = (pocId: string, board: CrmBoard) => send<CrmBuildPlan>('Preview Build in Cekat', 'POST', `/pocs/${pocId}/cekat/crm/preview`, { board })

/** Runs the build; each step arrives through onStatus. Resolves with the result, rejects on the first failure. */
export async function buildCrmInCekat(pocId: string, board: CrmBoard, onStatus: (text: string) => void): Promise<CrmBuildResult> {
  const res = await fetch(`/api/pocs/${pocId}/cekat/crm/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board }) })
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(`Build in Cekat: ${err.error ?? res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: CrmBuildResult | null = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as BuildEvent
      if (event.type === 'error') throw new Error(event.error)
      if (event.type === 'status') onStatus(event.text)
      if (event.type === 'result') result = event.data
    }
  }
  if (!result) throw new Error('The build stopped before it finished (server stopped?).')
  return result
}
