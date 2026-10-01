// Maps the model's POC draft onto a valid POC config (pure, no DB) — used by pocDraft.ts.
import type { z } from 'zod'
import { boardFromAi, type PocCrm } from '../../shared/pocCrm.ts'
import { flowFromAi } from '../../shared/pocFlow.ts'
import { POC_LABEL_MAX_CHARS } from '../../shared/pocLimits.ts'
import { cekatWebhookUrl } from '../../shared/pocWebhook.ts'
import { pocConfig } from '../validation.ts'

type PocConfig = z.infer<typeof pocConfig>

const API_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/

function toApiName(raw: unknown): string {
  const name = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .slice(0, 64)
  return API_NAME_RE.test(name) ? name : ''
}

function parseAiInput(raw: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(raw ?? ''))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // fall through to the empty schema
  }
  return { type: 'object', properties: {}, required: [], additionalProperties: false }
}

const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])
const httpsOnly = (u: unknown) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) && URL.canParse(u.trim()) ? u.trim() : '')

/** The model's CRM boards (columns by name, rows as values in column order) in the stored shape. */
export function crmFromAi(raw: unknown): PocCrm {
  const boards = raw && typeof raw === 'object' ? (raw as { boards?: unknown }).boards : undefined
  return { boards: list(boards).map(boardFromAi) }
}

export const labelsFromAi = (raw: unknown) =>
  list(raw).map((l) => ({ name: String(l.name ?? '').slice(0, POC_LABEL_MAX_CHARS), condition: String(l.condition ?? '').slice(0, POC_LABEL_MAX_CHARS) }))

/** Orders come from the list position; the first status has no entry condition. */
export const pipelineFromAi = (raw: unknown) =>
  list(raw).map((p, i) => ({ order: i + 1, status: String(p.status ?? '').slice(0, 120), condition: i === 0 ? '' : String(p.condition ?? '') }))

/** The model's knowledge base; uploaded files are never touched by the AI. */
export function knowledgeBaseFromAi(raw: unknown, files: PocConfig['knowledgeBase']['files']): PocConfig['knowledgeBase'] {
  const kb = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    textSections: list(kb.textSections).map((t) => ({ title: String(t.title ?? '').slice(0, 200), content: String(t.content ?? '') })),
    websites: list(kb.websites)
      .map((w) => ({ url: httpsOnly(w.url), note: String(w.note ?? '') }))
      .filter((w) => w.url),
    qna: list(kb.qna).map((q) => ({ question: String(q.question ?? '').slice(0, 500), answer: String(q.answer ?? '') })),
    files,
  }
}

type ApiIntegration = PocConfig['apiIntegrations'][number]
type HttpMethod = ApiIntegration['httpMethod']

const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const httpMethod = (v: unknown, fallback: HttpMethod): HttpMethod => (HTTP_METHODS.includes(v as HttpMethod) ? (v as HttpMethod) : fallback)

/** The model's API integrations; the API key and a custom webhook address of a same-named integration are kept. */
export function apiIntegrationsFromAi(raw: unknown, current: ApiIntegration[], clientName: string) {
  const byName = new Map(current.map((a) => [a.name, a]))
  return list(raw).map((a) => {
    const name = toApiName(a.name)
    const existing = name ? byName.get(name) : undefined
    return {
      name,
      httpMethod: httpMethod(a.httpMethod, 'POST'),
      description: String(a.description ?? ''),
      // Cekat always calls the n8n webhook on the Cekat workflow server; n8n calls the client API.
      webhookAddress: existing?.webhookAddress || (name ? cekatWebhookUrl(clientName, name) : ''),
      apiKey: existing?.apiKey ?? '',
      aiInput: parseAiInput(a.aiInputJson),
      targetMethod: httpMethod(a.targetMethod, 'GET'),
      targetUrl: httpsOnly(a.targetUrl),
      authUrl: httpsOnly(a.authUrl),
    }
  })
}

/** Integrations as the model sees them: no secrets, and the input schema as JSON text (like its output). */
export const apiIntegrationsForAi = (current: ApiIntegration[]) =>
  current.map(({ name, httpMethod, description, aiInput, targetMethod, targetUrl, authUrl }) => ({
    name,
    httpMethod,
    description,
    aiInputJson: JSON.stringify(aiInput),
    targetMethod,
    targetUrl,
    authUrl,
  }))

/** Maps the model output onto a valid POC config, keeping what the AI must not touch (uploads, API keys). */
export function toPocConfig(raw: Record<string, unknown>, current: PocConfig, clientName: string): PocConfig {
  const settings = (raw.additionalSettings ?? {}) as Record<string, unknown>
  return pocConfig.parse({
    ...current,
    agentBehavior: raw.agentBehavior,
    welcomeMessage: raw.welcomeMessage,
    agentTransferConditions: raw.agentTransferConditions,
    stopAiAfterHandoff: raw.stopAiAfterHandoff,
    silentAgentHandoff: raw.silentAgentHandoff,
    labels: labelsFromAi(raw.labels),
    pipeline: pipelineFromAi(raw.pipeline),
    knowledgeBase: knowledgeBaseFromAi(raw.knowledgeBase, current.knowledgeBase.files),
    apiIntegrations: apiIntegrationsFromAi(raw.apiIntegrations, current.apiIntegrations, clientName),
    crm: crmFromAi(raw.crm),
    flow: flowFromAi(raw),
    additionalSettings: { ...current.additionalSettings, ...settings },
  })
}
