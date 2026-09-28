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
import { CRM_COLUMN_TYPES } from '../../shared/pocCrm.ts'

const input = z.object({
  pocId: z.string().regex(UUID_RE),
  instruction: z.string().max(2000).default(''),
  /** 'crm' regenerates only the CRM structure and keeps the rest of the POC. */
  scope: z.enum(['all', 'crm']).default('all'),
})

const GROUNDING =
  'Only use facts from the requirements, TOR, deck and answered questions. Where something is unknown, write a clear placeholder like [KONFIRMASI KLIEN: …] instead of inventing it. Check the Cekat documentation tools when unsure how a feature works.'

const bool = { type: 'boolean' }
const int = (description: string) => ({ type: 'integer', description })
const oneOf = (values: string[]) => ({ type: 'string', enum: values })

const crmSchema = obj({
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

const CRM_TASK = [
  'CRM structure: design the Cekat CRM boards. A board is a table: typed columns (Text, Number, Date, Timeline, Email, Phone, Long Text, Checkbox, Select, Dropdown, References, Agents, Contacts, Companies, Conversation, Orders, Subscriptions, Files) and items (rows). The kanban view is the same board grouped by one Select column (its options are the pipeline stages, in order, each with the condition to move into it).',
  'Take the columns from the data the client must capture (e.g. name, phone, domicile, preferences, AI summary) and add 3–5 realistic sample items with fake data. When the CEKAT N8N NODES catalog lists CRM nodes, keep names usable by those nodes.',
].join('\n')

const schema = obj({
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
  additionalSettings: obj({
    aiHistoryLimit: int('Messages of history the AI reads (default 20)'),
    aiContextLimit: int('Knowledge chunks per answer (default 10)'),
    aiTemperature: oneOf(['low', 'balanced', 'creative']),
    messageAwait: int('Seconds to wait for more user messages before replying (default 5)'),
  }),
})

export async function generatePocDraft(body: unknown, out: Stream): Promise<void> {
  const req = input.parse(body)
  const poc = await queryOne<{ id: string; project_id: string; name: string; config: unknown; client_name: string; project_name: string }>(
    'select pocs.*, p.client_name, p.name as project_name from pocs join projects p on p.id = pocs.project_id where pocs.id = $1',
    [req.pocId],
  )
  if (!poc) throw new HttpError(404, 'POC not found')
  const current = pocConfig.parse(poc.config ?? {})
  const ctx = await loadProjectContext(poc.project_id)

  const crmOnly = req.scope === 'crm'
  const { data } = await runStructured({
    system: [BASE_SYSTEM, renderContextText(ctx)],
    task: (crmOnly
      ? [`Design the Cekat CRM structure for the POC "${poc.name}" of this project.`, CRM_TASK, GROUNDING, 'Write in the project language.', req.instruction && `Instruction from the SA: ${req.instruction}`]
      : [
      `Draft the complete Cekat AI Agent configuration for the POC "${poc.name}" of this project, ready to copy into the Cekat dashboard.`,
      'Fill every section: AI Agent Behavior (a thorough prompt), Welcome Message, handoff conditions, AI Action labels, conversation pipeline, Knowledge Base (static text, websites, Q&A) and the API Integrations the agent needs to call the client systems.',
      CRM_TASK,
      'API Integrations: the Cekat AI Agent never calls the client API directly. It calls an n8n webhook on https://workflows.cekat.ai/webhook/ (SA Copilot fills that address), and the n8n workflow first authenticates to the client system (authUrl) and then calls its endpoint (targetUrl, targetMethod), returning the result to Cekat. The httpMethod is how Cekat calls the webhook (usually POST). Describe in each description what the tool returns.',
      GROUNDING,
      'Write in the project language.',
      req.instruction && `Instruction from the SA: ${req.instruction}`,
    ])
      .filter(Boolean)
      .join('\n'),
    schema: crmOnly ? obj({ crm: crmSchema }) : schema,
    resultName: crmOnly ? 'CRM structure' : 'POC configuration',
    useDocTools: true,
    maxTokens: 32000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })

  const next = crmOnly ? { ...current, crm: crmFromAi(data.crm) } : toPocConfig(data, current, poc.client_name || poc.project_name)
  const row = await withTransaction(async (tx) => {
    const { rows } = await tx.query('update pocs set config = $2, updated_at = now() where id = $1 returning *', [poc.id, next])
    await tx.query(`insert into poc_versions (poc_id, config, origin, note) values ($1, $2, 'ai', $3)`, [
      poc.id,
      next,
      req.instruction ? `AI draft: ${req.instruction.slice(0, 200)}` : crmOnly ? 'AI-generated CRM structure' : 'AI-generated draft',
    ])
    return rows[0]
  })
  out.send({ type: 'result', data: row })
  out.send({ type: 'done' })
}
