// POC n8n workflow by AI: ONE gateway workflow for the whole POC (one webhook, every API integration a use case
// routed by its "action"), with one cURL per use case.
import type { z } from 'zod'
import { crmN8nValueGuide } from '../../shared/pocCrm.ts'
import type { pocConfig } from '../validation.ts'
import { WORKFLOW_TEXT_FORMAT, parseWorkflowSections } from '../../shared/pocN8n.ts'
import { config } from '../config.ts'
import { HttpError } from '../http.ts'
import { resolveEffort } from './common.ts'
import { cutOffMessage, runModel, type Effort, type RunResult } from './llm/index.ts'
import { callMcpTool } from './mcp.ts'
import { activeModel } from './models.ts'

type PocConfig = z.infer<typeof pocConfig>

/** Default when the SA leaves Max output tokens on Auto; thinking counts against it too. */
const MAX_TOKENS_PER_WORKFLOW = 64000

/** Everything a workflow must match: webhooks, inputs, client endpoints, CRM boards, the happy cases. */
export function n8nSummary(current: PocConfig): string {
  const summary = {
    apiIntegrations: current.apiIntegrations.map((a) => ({
      name: a.name,
      description: a.description,
      webhookAddress: a.webhookAddress,
      httpMethod: a.httpMethod,
      hasApiKey: !!a.apiKey,
      aiInput: a.aiInput,
      targetMethod: a.targetMethod,
      targetUrl: a.targetUrl,
      authUrl: a.authUrl,
    })),
    crmBoards: current.crm.boards.map((b) => ({ name: b.name, columns: b.columns.map((c) => ({ name: c.name, type: c.type })) })),
    crmSelectValuesForN8n: crmN8nValueGuide(current.crm),
    labels: current.labels,
    pipeline: current.pipeline,
    happyCases: current.flow.happyCases,
  }
  return `CURRENT POC CONFIGURATION (JSON):\n${JSON.stringify(summary, null, 2)}`
}

type WorkflowRequest = {
  system: string[]
  task: string
  label: string
  maxTokens: number
  onProgress?: (chars: number) => void
}

type WriteWorkflow = (req: WorkflowRequest) => Promise<{ data: Record<string, unknown> }>

/** One model call for a workflow; `effort` overrides the configured effort (used by the compact retry). */
type CallModel = (task: string, effort?: Effort) => Promise<RunResult>

/** Asks for the maximalist workflow of the N8N WORKFLOW RULES; dropped on the compact retry, which overrides them. */
export const FOLLOW_RULES = 'Follow the N8N WORKFLOW RULES in the context exactly.'

const COMPACT_RETRY = [
  'IMPORTANT: a previous answer to this task was cut off because it was too long. Write a COMPACT version: keep every use case and its cURL, but at most 3 nodes per use case branch besides the shared ones, short Code nodes (only the essential logic), a one-sentence description and one-line test notes. Keep it complete and importable.',
  'This overrides the N8N WORKFLOW RULES where they ask for more: no separate error branch per client status code, a one-sentence description instead of branch by branch, and cURLs with only the required AI Input fields.',
].join(' ')

async function callWorkflowModel(req: WorkflowRequest, task: string, effort?: Effort): Promise<RunResult> {
  const model = await activeModel()
  return runModel({
    model,
    system: req.system,
    turns: [{ role: 'user', content: `${task}\n\n${WORKFLOW_TEXT_FORMAT}` }],
    attachments: [],
    tools: [],
    runTool: callMcpTool,
    effort: effort ?? (await resolveEffort(model, config.anthropic.generateEffort)),
    maxTokens: req.maxTokens,
    onProgress: req.onProgress,
  })
}

async function tooLarge(req: WorkflowRequest): Promise<HttpError> {
  const model = await activeModel().catch(() => null)
  return new HttpError(502, cutOffMessage(`The n8n workflow ${req.label}`, req.maxTokens, model?.maxOutput ?? null, 'or ask for fewer steps (e.g. "maksimal 8 node")'))
}

/**
 * One workflow as plain-text sections. Proxies such as 9router buffer tool-call arguments until the answer
 * ends (no progress, and heavy on the proxy); text streams through as it is written. When the answer is cut
 * off it asks once more for a compact workflow with less thinking, which usually fits.
 */
export async function writeWorkflowAsText(req: WorkflowRequest, call: CallModel = (task, effort) => callWorkflowModel(req, task, effort)): Promise<{ data: Record<string, unknown> }> {
  let result = await call(req.task)
  if (result.stopReason === 'max_tokens') {
    // Without this the retry asks for a compact workflow and for the maximalist rules in the same turn.
    const relaxed = req.task.split('\n').filter((line) => line.trim() !== FOLLOW_RULES).join('\n')
    result = await call(`${relaxed}\n\n${COMPACT_RETRY}`, 'low')
  }
  if (result.stopReason === 'max_tokens') throw await tooLarge(req)
  const data = parseWorkflowSections(result.text)
  if (!data) throw new HttpError(502, `The model did not return the n8n workflow ${req.label} — try again or pick another model.`)
  return { data }
}

export type N8nProgress = { done: number; total: number }

export type N8nDraftRequest = {
  system: string[]
  pocName: string
  current: PocConfig
  instruction: string
  /** Characters written so far, and whether the workflow is finished (done 0 or 1 of total 1). */
  onProgress?: (chars: number, info: N8nProgress) => void
  onToolUse?: (name: string, input: unknown) => void
}

/** What the gateway must cover: one use case per API integration, all on the integrations' shared webhook. */
function gatewayFocus(pocName: string, current: PocConfig): string {
  const actions = current.apiIntegrations.map((a) => a.name).filter(Boolean)
  if (!actions.length) {
    return `The POC "${pocName}" has no API integration yet: write the ONE n8n gateway workflow with the use cases its flow needs (e.g. creating a ticket in the Cekat CRM), each routed by its "action". 1 use case = 1 cURL.`
  }
  const webhook = current.apiIntegrations.map((a) => a.webhookAddress.trim()).find(Boolean)
  return [
    `Write the ONE n8n gateway workflow of the POC "${pocName}": a single webhook, and every API integration as one use case routed by Switch Action on "action" — actions ${actions.map((a) => `"${a}"`).join(', ')}, in this order.`,
    'Include every step each use case needs (e.g. generating and storing a ticket id, creating or updating the Cekat CRM item). 1 use case = 1 cURL.',
    webhook ? `Webhook URL of the gateway (all API integrations call it): ${webhook}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The POC's one gateway workflow, as parsed sections (see WORKFLOW_TEXT_FORMAT). */
export async function draftN8nWorkflow(req: N8nDraftRequest, run: WriteWorkflow = writeWorkflowAsText): Promise<Record<string, unknown>> {
  const extra = req.instruction && `Instruction from the SA: ${req.instruction}`
  let chars = 0
  req.onProgress?.(chars, { done: 0, total: 1 })
  const { data } = await run({
    system: req.system,
    task: [gatewayFocus(req.pocName, req.current), n8nSummary(req.current), FOLLOW_RULES, 'Write in the project language.', extra].filter(Boolean).join('\n'),
    label: 'gateway',
    maxTokens: MAX_TOKENS_PER_WORKFLOW,
    onProgress: (c) => {
      chars = c
      req.onProgress?.(chars, { done: 0, total: 1 })
    },
  })
  req.onProgress?.(chars, { done: 1, total: 1 })
  return data
}
