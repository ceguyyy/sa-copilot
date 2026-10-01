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
import { CRM_COLUMN_TYPES, crmN8nValueGuide } from '../../shared/pocCrm.ts'
import { flowFromAi } from '../../shared/pocFlow.ts'
import { n8nFromAi } from '../../shared/pocN8n.ts'
import { draftN8nWorkflow, type N8nProgress } from './pocN8nDraft.ts'

const input = z.object({
  pocId: z.string().regex(UUID_RE),
  instruction: z.string().max(2000).default(''),
  /** 'crm' regenerates only the CRM structure, 'flow' only the flowchart and happy cases, 'n8n' only the n8n workflows; the rest of the POC is kept. */
  scope: z.enum(['all', 'crm', 'flow', 'n8n']).default('all'),
})

export const GROUNDING =
  'Only use facts from the requirements, TOR, deck and answered questions. Where something is unknown, write a clear placeholder like [KONFIRMASI KLIEN: …] instead of inventing it. Check the Cekat documentation tools when unsure how a feature works.'

const bool = { type: 'boolean' }
const int = (description: string) => ({ type: 'integer', description })
const oneOf = (values: string[]) => ({ type: 'string', enum: values })

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
        'Columns in display order; the first one is the item title (usually "Lead" or the customer name, type text)',
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
  agentBehavior: str('Full AI Agent Behavior prompt in markdown: identity, tone, rules, flows, limits'),
  welcomeMessage: str('First message the AI sends to the user'),
  agentTransferConditions: str('When the AI hands the chat over to a human agent'),
  stopAiAfterHandoff: bool,
  silentAgentHandoff: bool,
  labels: arr(obj({ name: str('Label name, e.g. "Booking"'), condition: str('When the AI applies this label') })),
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

const MAX_BEHAVIOR_CHARS = 8000

/** What the flow draft must stay consistent with: the POC as it is now. */
export function currentPocSummary(current: PocConfig): string {
  const summary = {
    agentBehavior: current.agentBehavior.slice(0, MAX_BEHAVIOR_CHARS),
    welcomeMessage: current.welcomeMessage,
    agentTransferConditions: current.agentTransferConditions,
    labels: current.labels,
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
      'Fill every section: AI Agent Behavior (a thorough prompt), Welcome Message, handoff conditions, AI Action labels, conversation pipeline, Knowledge Base (static text, websites, Q&A), the API Integrations the agent needs to call the client systems, the conversation flowchart and the happy cases.',
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
