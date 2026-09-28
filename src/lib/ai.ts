// Client for the local server's /api/ai endpoints. Responses are NDJSON streams.
import type { DocType } from '../../shared/schemas.ts'
import type { ConsistencyCheck } from './api'
import type { PocRow } from './types'

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'progress'; chars: number }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'proposal'; data: Record<string, unknown> }
  | { type: 'result'; data: unknown }
  | { type: 'done'; documentId?: string; versionId?: string; versionNo?: number; documentIds?: string[] }
  | { type: 'error'; error: string }

type Done = Extract<StreamEvent, { type: 'done' }>

async function post(path: string, body: Record<string, unknown>, onEvent: (e: StreamEvent) => void, signal?: AbortSignal): Promise<Done> {
  const res = await fetch(`/api/ai${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `AI request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done: Done | null = null
  for (;;) {
    const { value, done: finished } = await reader.read()
    if (finished) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as StreamEvent
      if (event.type === 'error') throw new Error(event.error)
      if (event.type === 'done') done = event
      onEvent(event)
    }
  }
  if (!done) throw new Error('Connection closed before the AI finished (server stopped?)')
  return done
}

/** Human-readable label for a tool call, e.g. "cekat_docs__searchDocumentation" + {query} → "Searching Cekat docs: broadcast". */
export function describeTool(name: string, input: unknown): string {
  if (name === 'contrast__check') return 'Fixing low-contrast colors'
  if (name === 'check_mcp_server') return `Testing connection: ${String((input as { url?: string })?.url ?? '')}`
  const [server, tool = name] = name.split('__')
  const source = server.replace(/_/g, ' ')
  const arg = input && typeof input === 'object' ? Object.values(input as Record<string, unknown>).find((v) => typeof v === 'string') : undefined
  const verb = /search/i.test(tool) ? 'Searching' : /get|read|fetch/i.test(tool) ? 'Reading' : `Using ${tool} on`
  return `${verb} ${source}${arg ? `: ${String(arg).slice(0, 80)}` : ''}`
}

export function chat(
  params: { projectId: string; message: string; skillId?: string; attachmentIds?: string[]; focus?: string },
  onText: (t: string) => void,
  signal?: AbortSignal,
  onTool?: (label: string) => void,
) {
  return post(
    '',
    { action: 'chat', ...params },
    (e) => {
      if (e.type === 'delta') onText(e.text)
      else if (e.type === 'tool') onTool?.(describeTool(e.name, e.input))
    },
    signal,
  )
}

export interface GenerateRequest {
  projectId: string
  docType: DocType
  documentId?: string
  skillId?: string
  instruction?: string
  diagramKind?: string
  templateId?: string
  attachmentIds?: string[]
}

export function generate(params: GenerateRequest, onProgress: (chars: number) => void, onTool?: (label: string) => void) {
  return post('', { action: 'generate', ...params }, (e) => {
    if (e.type === 'progress') onProgress(e.chars)
    else if (e.type === 'tool') onTool?.(describeTool(e.name, e.input))
  })
}

export interface AssistMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Skill / template / theme designer chat. Resolves with the proposed field values, if the AI made a proposal. */
export async function assist(
  params: {
    kind: 'skill' | 'template' | 'theme' | 'mcp'
    current: Record<string, unknown>
    messages: AssistMessage[]
    ownerId?: string
    attachmentIds?: string[]
  },
  handlers: { onText: (t: string) => void; onTool?: (label: string) => void; onProgress?: (chars: number) => void },
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  let proposal: Record<string, unknown> | null = null
  await post(
    '/assist',
    params,
    (e) => {
      if (e.type === 'delta') handlers.onText(e.text)
      else if (e.type === 'tool') handlers.onTool?.(describeTool(e.name, e.input))
      else if (e.type === 'progress') handlers.onProgress?.(e.chars)
      else if (e.type === 'proposal') proposal = e.data
    },
    signal,
  )
  return proposal
}

/** Splits a diagram into one diagram per lane (or per the instruction). Resolves with the new document ids. */
export async function splitDiagram(params: { documentId: string; instruction?: string }, onProgress: (chars: number) => void): Promise<string[]> {
  const done = await post('/split-diagram', params, (e) => e.type === 'progress' && onProgress(e.chars))
  return done.documentIds ?? []
}

/** Streams an AI summary of the project's audit trail (or an answer to a question about it). */
export function summarizeAudit(params: { projectId: string; days?: number; question?: string }, onText: (t: string) => void, signal?: AbortSignal) {
  return post('/audit-summary', params, (e) => e.type === 'delta' && onText(e.text), signal)
}

/** Runs a streamed AI job that ends with one `result` event; reports progress and tool activity. */
export interface JobHandlers {
  onProgress?: (chars: number) => void
  onTool?: (label: string) => void
}

async function job<T>(path: string, params: Record<string, unknown>, handlers: JobHandlers = {}): Promise<T> {
  let result: T | undefined
  await post(path, params, (e) => {
    if (e.type === 'progress') handlers.onProgress?.(e.chars)
    else if (e.type === 'tool') handlers.onTool?.(describeTool(e.name, e.input))
    else if (e.type === 'result') result = e.data as T
  })
  if (result === undefined) throw new Error('The AI finished without a result — try again.')
  return result
}

export const checkConsistency = (projectId: string, handlers?: JobHandlers) =>
  job<ConsistencyCheck>('/consistency', { projectId }, handlers)

export interface MeetingResult {
  sourceId: string
  title: string
  summary: string
  requirements: { title: string; detail: string }[]
  decisions: string[]
  action_items: { task: string; owner: string; due: string }[]
  open_questions: { question: string; context: string }[]
}

export const processMeetingNotes = (params: { projectId: string; title?: string; notes: string; attachmentIds: string[] }, handlers?: JobHandlers) =>
  job<MeetingResult>('/meeting-notes', params, handlers)

export const findQuestions = (projectId: string, handlers?: JobHandlers) => job<{ added: number }>('/find-questions', { projectId }, handlers)

/** Streams a plain-language summary of what changed between two versions. */
export function summarizeVersionDiff(params: { documentId: string; fromVersionId: string; toVersionId: string }, onText: (t: string) => void) {
  return post('/version-diff', params, (e) => e.type === 'delta' && onText(e.text))
}

export const generateDemoScenarios = (params: { projectId: string; count: number; instruction?: string }, handlers?: JobHandlers) =>
  job<{ added: number; skipped: number }>('/demo-scenarios', params, handlers)

/** Drafts every section of a POC from the project sources; the server saves it as a new `ai` version. */
export const draftPoc = (params: { pocId: string; instruction?: string; scope?: 'all' | 'crm' }, handlers?: JobHandlers) =>
  job<PocRow>('/poc-draft', params, handlers)
