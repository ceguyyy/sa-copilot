// Maps the model's POC draft onto a valid POC config (pure, no DB) — used by pocDraft.ts.
import type { z } from 'zod'
import { boardFromAi, type PocCrm } from '../../shared/pocCrm.ts'
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

/** Maps the model output onto a valid POC config, keeping what the AI must not touch (uploads, API keys). */
export function toPocConfig(raw: Record<string, unknown>, current: PocConfig, clientName: string): PocConfig {
  const kb = (raw.knowledgeBase ?? {}) as Record<string, unknown>
  const settings = (raw.additionalSettings ?? {}) as Record<string, unknown>
  const currentKeys = new Map(current.apiIntegrations.map((a) => [a.name, a.apiKey]))
  return pocConfig.parse({
    ...current,
    agentBehavior: raw.agentBehavior,
    welcomeMessage: raw.welcomeMessage,
    agentTransferConditions: raw.agentTransferConditions,
    stopAiAfterHandoff: raw.stopAiAfterHandoff,
    silentAgentHandoff: raw.silentAgentHandoff,
    labels: list(raw.labels).map((l) => ({ name: String(l.name ?? '').slice(0, 80), condition: String(l.condition ?? '') })),
    pipeline: list(raw.pipeline).map((p, i) => ({ order: i + 1, status: String(p.status ?? '').slice(0, 120), condition: i === 0 ? '' : String(p.condition ?? '') })),
    knowledgeBase: {
      textSections: list(kb.textSections).map((t) => ({ title: String(t.title ?? '').slice(0, 200), content: String(t.content ?? '') })),
      websites: list(kb.websites)
        .map((w) => ({ url: httpsOnly(w.url), note: String(w.note ?? '') }))
        .filter((w) => w.url),
      qna: list(kb.qna).map((q) => ({ question: String(q.question ?? '').slice(0, 500), answer: String(q.answer ?? '') })),
      files: current.knowledgeBase.files,
    },
    apiIntegrations: list(raw.apiIntegrations).map((a) => {
      const name = toApiName(a.name)
      return {
        name,
        httpMethod: a.httpMethod,
        description: String(a.description ?? ''),
        // Cekat always calls the n8n webhook on the Cekat workflow server; n8n calls the client API.
        webhookAddress: name ? cekatWebhookUrl(clientName, name) : '',
        apiKey: currentKeys.get(name) ?? '',
        aiInput: parseAiInput(a.aiInputJson),
        targetMethod: a.targetMethod,
        targetUrl: httpsOnly(a.targetUrl),
        authUrl: httpsOnly(a.authUrl),
      }
    }),
    crm: crmFromAi(raw.crm),
    additionalSettings: { ...current.additionalSettings, ...settings },
  })
}
