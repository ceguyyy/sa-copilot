// Client for the `ai` edge function. Responses are NDJSON streams.
import type { DocType } from '../../supabase/functions/_shared/schemas.ts'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase'

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'progress'; chars: number }
  | { type: 'done'; documentId?: string; versionId?: string; versionNo?: number }
  | { type: 'error'; error: string }

async function post(body: Record<string, unknown>, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session expired — please sign in again')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
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
  let done: StreamEvent | null = null
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
  if (!done) throw new Error('Connection closed before the AI finished (function timeout?)')
  return done as Extract<StreamEvent, { type: 'done' }>
}

export function chat(params: { projectId: string; message: string; skillId?: string }, onText: (t: string) => void, signal?: AbortSignal) {
  return post({ action: 'chat', ...params }, (e) => e.type === 'delta' && onText(e.text), signal)
}

export function generate(
  params: { projectId: string; docType: DocType; documentId?: string; skillId?: string; instruction?: string; diagramKind?: string },
  onProgress: (chars: number) => void,
) {
  return post({ action: 'generate', ...params }, (e) => e.type === 'progress' && onProgress(e.chars))
}
