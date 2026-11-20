// Drafts a POC (Cekat AI Agent configuration) from the project's requirements, TOR, deck and answered questions.
import { z } from 'zod'
import { queryOne, withTransaction } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { pocConfig } from '../validation.ts'
import { BASE_SYSTEM, toolEvents } from './common.ts'
import { loadProjectContext, renderContextText } from './context.ts'
import type { Stream } from './stream.ts'
import { arr, obj, runStructured, str } from './structured.ts'
import { crmFromAi, toPocConfig } from './pocMapping.ts'
import { BEHAVIOR_LIMITS, composeAgentBehavior } from '../../shared/pocBehavior.ts'
import { SDK_PROPERTY_TYPES } from '../../shared/pocConversions.ts'
import { CRM_COLUMN_TYPES, crmN8nValueGuide } from '../../shared/pocCrm.ts'
import { flowFromAi } from '../../shared/pocFlow.ts'
import { n8nFromAi } from '../../shared/pocN8n.ts'
import { draftN8nWorkflow, type N8nProgress } from './pocN8nDraft.ts'
import { CHAT_FLOW_TASK, chatFlowSchema } from './pocChatFlowDraft.ts'
import { chatFlowsFromAi } from '../../shared/pocChatFlowAi.ts'

const input = z.object({
  pocId: z.string().regex(UUID_RE),
  instruction: z.string().max(2000).default(''),
  /** 'crm' regenerates only the CRM structure, 'flow' only the flowchart and happy cases, 'n8n' only the n8n workflows, 'chatFlow' only the POC Flow (Cekat Flow builder); the rest of the POC is kept. */
  scope: z.enum(['all', 'crm', 'flow', 'n8n', 'chatFlow']).default('all'),
})

export const GROUNDING =
  'Only use facts from the requirements, TOR, deck and answered questions. Where something is unknown, write a clear placeholder like [KONFIRMASI KLIEN: …] instead of inventing it. Check the Cekat documentation tools when unsure how a feature works.'

const bool = { type: 'boolean' }
const int = (description: string) => ({ type: 'integer', description })
const oneOf = (values: string[]) => ({ type: 'string', enum: values })

const adTargetsSchema = obj({
  meta: str('Meta Ads event name to send (e.g. QualifiedLead, LeadSubmitted, Purchase), or a custom name; empty if not sent to Meta'),
  tiktok: str('TikTok Ads event name to send (e.g. SubmitForm, Contact, CompletePayment), or a custom name; empty if not sent to TikTok'),
  google: str('Google Ads conversion name to send (e.g. Qualified lead, Purchase), or a custom name; empty if not sent to Google'),
})

export const CONVERSIONS_TASK =
  'Ads conversions (CAPI): when the client runs Meta, TikTok or Google ads, set on each label that marks a funnel step the event to send to each ad platform (e.g. a "Qualified" label as QualifiedLead to Meta). Use the standard event names; a custom name is sent as a custom event. Leave a platform empty when the client does not advertise there or the label is not a conversion. Add sdkEvents only for actions that happen in the client system outside the chat (e.g. payment confirmed in their backend).'

export const crmSchema = obj({
  boards: arr(
    obj({
      name: str('Cekat CRM board, e.g. "Leads KPR", "Booking"'),
      description: str('What this board tracks'),
      columns: arr(
        obj({
          name: str('Column header, e.g. "Lead", "Status", "Nomor Telepon"'),
          type: oneOf([...CRM_COLUMN_TYPES]),
          options: arr(obj({ label: str('Option, e.g. "New Lead"'), condition: str('When an item moves into this option; empty for the first option') }), 'Only for select/dropdown columns, in pipeline order; empty otherwise'),
        }),
        'Columns in display order. Column 1 is the board key (the item title, type text, e.g. "Phone_number" or "Lead"); column 2 duplicates it with the same name plus "(2)" (e.g. "Phone_number(2)", type phone for a phone number) and holds the same value in every row',
      ),
      kanbanColumn: str('Name of the select column the kanban view is grouped by (usually "Status")'),
      rows: arr(obj({ values: arr(str(), 'One value per column, in column order; select values must be one of its options; checkbox "true"/"false"') }), '3–5 realistic sample items with fake data'),
    }),
    'CRM boards the client needs in the Cekat CRM',
  ),
})

export const CRM_TASK = [
  'CRM structure: design the Cekat CRM boards. A board is a table: typed columns (Text, Number, Date, Timeline, Email, Phone, Long Text, Checkbox, Select, Dropdown, References, Agents, Contacts, Companies, Conversation, Orders, Subscriptions, Files) and items (rows). The kanban view is the same board grouped by one Select column (its options are the pipeline stages, in order, each with the condition to move into it).',
  'Take the columns from the data the client must capture (e.g. name, phone, domicile, preferences, AI summary) and add 3–5 realistic sample items with fake data. When the CEKAT N8N NODES catalog lists CRM nodes, keep names usable by those nodes.',
  'Cekat CRM rule: column 1 is the key and cannot be deleted; column 2 must be its duplicate named "<column 1>(2)", e.g. "Phone_number" then "Phone_number(2)", with the same value in each sample item.',
].join('\n')

export const flowFields = {
  flowchart: str('Mermaid flowchart source starting with "flowchart TD", no ``` fences'),
  happyCases: arr(
    obj({
      title: str('Scenario name, e.g. "Booking dokter gigi"'),
      goal: str('What the user achieves at the end'),
      steps: arr(
        obj({
          user: str('Exact message the tester types in the Cekat chat'),
          ai: str('Expected AI reply, summarised'),
          action: str('Expected action: tool name with key parameters, label applied, pipeline status change or agent handoff; empty if none'),
        }),
      ),
    }),
    '2-4 end-to-end happy path scenarios',
  ),
}

export const FLOW_TASK = [
  'Flowchart: a Mermaid "flowchart TD" of the conversation: welcome message -> detect the intent -> one branch per main flow, using the exact label names, pipeline statuses and API integration tool names of the POC -> agent handoff when the transfer conditions apply -> end. Quote every node label (A["Cek jadwal dokter"]), use plain ASCII node ids, decisions as {"..."}, no HTML, at most about 30 nodes.',
  'Happy cases: 2-4 end-to-end scenarios that follow the flowchart so the SA can try the agent in Cekat. Each step: what the user types (realistic, in the project language), the expected AI reply and the expected action. Together they use every API integration tool at least once. When a step creates or updates a Cekat CRM item, write each Select/Dropdown value as its option number with the label (zero-based, e.g. "Stage = 1 (PO)" when PO is the second option).',
].join('\n')

export const schema = obj({
  communicationStyle: str(`AI Agent Behavior — Communication Style (markdown): identity, persona, tone, language and reply format. Max ${BEHAVIOR_LIMITS.communicationStyle} characters`),
  conversationFlow: str(`AI Agent Behavior — Conversation Flow (markdown): greeting, intent detection, each main flow step by step and when to call which API tool, label or handoff. Max ${BEHAVIOR_LIMITS.conversationFlow} characters`),
  rulesRestrictions: str(`AI Agent Behavior — Rules & Restrictions (markdown): what the AI must always or never do, limits, topics it must not answer. Max ${BEHAVIOR_LIMITS.rulesRestrictions} characters`),
  customInstructions: arr(
    obj({ title: str('Short name of the extra instruction'), content: str(`The instruction (markdown). Max ${BEHAVIOR_LIMITS.customInstruction} characters`) }),
    'Extra instructions that fit none of the three segments (e.g. promo rules, a special case); usually empty or a few',
  ),
  welcomeMessage: str('First message the AI sends to the user'),
  agentTransferConditions: str('When the AI hands the chat over to a human agent'),
  stopAiAfterHandoff: bool,
  silentAgentHandoff: bool,
  labels: arr(obj({ name: str('Label name, e.g. "Booking"'), condition: str('When the AI applies this label'), conversion: adTargetsSchema })),
  sdkEvents: arr(
    obj({
      name: str('Event name, e.g. "Trial started"'),
      key: str('Event key: lowercase letters, digits and _, e.g. "trial_started"'),
      description: str('When the client system sends this event to Cekat'),
      properties: arr(obj({ key: str('Property key, lowercase and _'), type: oneOf([...SDK_PROPERTY_TYPES]) }), 'Up to 10 properties, e.g. value, order_id'),
      targets: adTargetsSchema,
    }),
    'Custom events the client system sends to Cekat with the SDK (e.g. order paid in their backend); empty when the client has no such system events',
  ),
  pipeline: arr(obj({ status: str('Pipeline status name'), condition: str('Condition to move from the previous status into this one; empty for the first status') }), 'Ordered pipeline statuses'),
  knowledgeBase: obj({
    textSections: arr(obj({ title: str(), content: str('Static facts in markdown, only from the provided sources') })),
    websites: arr(obj({ url: str('https:// URL mentioned in the sources'), note: str() })),
    qna: arr(obj({ question: str(), answer: str() })),
  }),
  apiIntegrations: arr(
    obj({
      name: str('Tool name: lowercase letters, digits and _, starts with a letter, max 64 chars'),
      httpMethod: oneOf(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      description: str('When the AI should call this tool and what it returns'),
      aiInputJson: str('JSON Schema (as a JSON string) of the parameters the AI must send'),
      targetMethod: oneOf(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      targetUrl: str('Full URL of the client API endpoint the n8n workflow calls (e.g. the Doctor Assist endpoint), from the sources; empty if unknown'),
      authUrl: str('Login/token endpoint of the client API the n8n workflow calls first to get a token; empty if the API needs no login'),
    }),
  ),
  crm: crmSchema,
  ...flowFields,
  additionalSettings: obj({
    aiHistoryLimit: int('Messages of history the AI reads (default 20)'),
    aiContextLimit: int('Knowledge chunks per answer (default 10)'),
    aiTemperature: oneOf(['low', 'balanced', 'creative']),
    messageAwait: int('Seconds to wait for more user messages before replying (default 5)'),
  }),
})

type PocConfig = z.infer<typeof pocConfig>

type PocDraftScope = z.infer<typeof input>['scope']

type ScopePlan = { task: string[]; schema: Record<string, unknown>; resultName: string; note: string; apply: (data: Record<string, unknown>) => PocConfig }

const MAX_BEHAVIOR_CHARS = 24_000

export const BEHAVIOR_KEYS = ['communicationStyle', 'conversationFlow', 'rulesRestrictions', 'customInstructions'] as const

export const BEHAVIOR_TASK = `AI Agent Behavior is written in segments that Cekat receives as one prompt: Communication Style (max ${BEHAVIOR_LIMITS.communicationStyle} characters), Conversation Flow (max ${BEHAVIOR_LIMITS.conversationFlow}), Rules & Restrictions (max ${BEHAVIOR_LIMITS.rulesRestrictions}) and optional Custom Instructions (max ${BEHAVIOR_LIMITS.customInstruction} each). Put each instruction in the segment it belongs to, never repeat it in another one, and stay within the limits.`

/** What the flow draft must stay consistent with: the POC as it is now. */
export function currentPocSummary(current: PocConfig): string {
  const summary = {
    agentBehavior: composeAgentBehavior(current).slice(0, MAX_BEHAVIOR_CHARS),
    welcomeMessage: current.welcomeMessage,
    agentTransferConditions: current.agentTransferConditions,
    labels: current.labels,
    sdkEvents: current.sdkEvents.map(({ name, key, description }) => ({ name, key, description })),
    pipeline: current.pipeline,
    apiIntegrations: current.apiIntegrations.map(({ name, description, aiInput }) => ({ name, description, aiInput })),
    crmSelectValuesForN8n: crmN8nValueGuide(current.crm),
  }
  return `CURRENT POC CONFIGURATION (JSON):\n${JSON.stringify(summary, null, 2)}`
}

function scopePlan(scope: Exclude<PocDraftScope, 'n8n'>, pocName: string, current: PocConfig, clientName: string): ScopePlan {
  if (scope === 'crm') {
    return {
      task: [`Design the Cekat CRM structure for the POC "${pocName}" of this project.`, CRM_TASK],
      schema: obj({ crm: crmSchema }),
      resultName: 'CRM structure',
      note: 'AI-generated CRM structure',
      apply: (data) => ({ ...current, crm: crmFromAi(data.crm) }),
    }
  }
  if (scope === 'chatFlow') {
    return {
      task: [`Design the Cekat Flow builder flows (POC Flow) for the POC "${pocName}" of this project, consistent with its current configuration.`, currentPocSummary(current), CHAT_FLOW_TASK],
      schema: chatFlowSchema,
      resultName: 'POC Flow',
      note: 'AI-generated POC Flow',
      apply: (data) => {
        const chatFlows = chatFlowsFromAi(data)
        // Never replace the saved flows with nothing.
        if (!chatFlows.flows.length) throw new HttpError(502, 'The model returned no flow — try again or pick another model.')
        return { ...current, chatFlows }
      },
    }
  }
  if (scope === 'flow') {
    return {
      task: [`Draw the conversation flowchart and write the happy cases for the POC "${pocName}" of this project, consistent with its current configuration.`, currentPocSummary(current), FLOW_TASK],
      schema: obj(flowFields),
      resultName: 'flowchart and happy cases',
      note: 'AI-generated flowchart & happy cases',
      apply: (data) => ({ ...current, flow: flowFromAi(data) }),
    }
  }
  return {
    task: [
      `Draft the complete Cekat AI Agent configuration for the POC "${pocName}" of this project, ready to copy into the Cekat dashboard.`,
      'Fill every section: AI Agent Behavior (thorough segments), Welcome Message, handoff conditions, AI Action labels, conversation pipeline, Knowledge Base (static text, websites, Q&A), the API Integrations the agent needs to call the client systems, the conversation flowchart and the happy cases.',
      BEHAVIOR_TASK,
      CONVERSIONS_TASK,
      CRM_TASK,
      'API Integrations: the Cekat AI Agent never calls the client API directly. It calls an n8n webhook on https://workflows.cekat.ai/webhook/ (SA Copilot fills that address), and the n8n workflow first authenticates to the client system (authUrl) and then calls its endpoint (targetUrl, targetMethod), returning the result to Cekat. The httpMethod is how Cekat calls the webhook (usually POST). Describe in each description what the tool returns.',
      FLOW_TASK,
    ],
    schema,
    resultName: 'POC configuration',
    note: 'AI-generated draft',
    apply: (data) => toPocConfig(data, current, clientName),
  }
}

type Drafted = { next: PocConfig; note: string }
type ToolUse = (name: string, input: unknown) => void

async function draftWithPlan(plan: ScopePlan, system: string[], instruction: string, onProgress: (chars: number) => void, onToolUse: ToolUse): Promise<Drafted> {
  const { data } = await runStructured({
    system,
    task: [...plan.task, GROUNDING, 'Write in the project language.', instruction && `Instruction from the SA: ${instruction}`].filter(Boolean).join('\n'),
    schema: plan.schema,
    resultName: plan.resultName,
    useDocTools: true,
    maxTokens: 32000,
    onProgress,
    onToolUse,
  })
  return { next: plan.apply(data), note: plan.note }
}

async function draftN8nScope(system: string[], pocName: string, current: PocConfig, instruction: string, onProgress: (chars: number, info: N8nProgress) => void, onToolUse: ToolUse): Promise<Drafted> {
  const workflow = await draftN8nWorkflow({ system, pocName, current, instruction, onProgress, onToolUse })
  const n8n = n8nFromAi({ workflows: [workflow] })
  // Never replace the saved workflows with nothing.
  if (!n8n.workflows.length) throw new HttpError(502, 'The model returned an empty n8n workflow — try again or pick another model.')
  return { next: { ...current, n8n }, note: 'AI-generated n8n gateway workflow' }
}

export async function generatePocDraft(body: unknown, out: Stream): Promise<void> {
  const req = input.parse(body)
  const poc = await queryOne<{ id: string; project_id: string; name: string; config: unknown; client_name: string; project_name: string }>(
    'select pocs.*, p.client_name, p.name as project_name from pocs join projects p on p.id = pocs.project_id where pocs.id = $1',
    [req.pocId],
  )
  if (!poc) throw new HttpError(404, 'POC not found')
  const current = pocConfig.parse(poc.config ?? {})
  const ctx = await loadProjectContext(poc.project_id)

  const system = [BASE_SYSTEM, renderContextText(ctx)]
  const onProgress = (chars: number, info?: N8nProgress) => out.send({ type: 'progress', chars, ...info })
  const { next, note } =
    req.scope === 'n8n'
      ? await draftN8nScope(system, poc.name, current, req.instruction, onProgress, toolEvents(out))
      : await draftWithPlan(scopePlan(req.scope, poc.name, current, poc.client_name || poc.project_name), system, req.instruction, onProgress, toolEvents(out))
  const row = await withTransaction(async (tx) => {
    const { rows } = await tx.query('update pocs set config = $2, updated_at = now() where id = $1 returning *', [poc.id, next])
    await tx.query(`insert into poc_versions (poc_id, config, origin, note) values ($1, $2, 'ai', $3)`, [
      poc.id,
      next,
      req.instruction ? `${note}: ${req.instruction.slice(0, 200)}` : note,
    ])
    return rows[0]
  })
  out.send({ type: 'result', data: row })
  out.send({ type: 'done' })
}
