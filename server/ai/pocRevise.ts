// "Revise with AI" for one POC section or one long text field. Works on the SA's unsaved draft and only
// proposes the new value — nothing is saved; the UI shows the diff and the SA accepts or discards it.
import { z } from 'zod'
import { queryOne } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { pocConfig } from '../validation.ts'
import { BASE_SYSTEM, toolEvents } from './common.ts'
import { loadProjectContext, renderContextText } from './context.ts'
import { apiIntegrationsForAi, apiIntegrationsFromAi, crmFromAi, knowledgeBaseFromAi, labelsFromAi, pipelineFromAi } from './pocMapping.ts'
import { CRM_TASK, FLOW_TASK, GROUNDING, crmSchema, currentPocSummary, flowFields, schema as draftSchema } from './pocDraft.ts'
import type { Stream } from './stream.ts'
import { obj, runStructured, str } from './structured.ts'
import { boardToAi } from '../../shared/pocCrm.ts'
import { flowFromAi } from '../../shared/pocFlow.ts'
import {
  FIELD_LABELS,
  POC_REVISE_FIELDS,
  POC_REVISE_SECTIONS,
  SECTION_LABELS,
  fieldText,
  reviseTargetLabel,
  withFieldText,
  type PocReviseSection,
  type PocReviseTarget,
} from '../../shared/pocRevise.ts'

type PocConfig = z.infer<typeof pocConfig>

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), section: z.enum(POC_REVISE_SECTIONS) }),
  z.object({ kind: z.literal('field'), field: z.enum(POC_REVISE_FIELDS), index: z.number().int().min(0).optional() }),
])

const input = z.object({
  pocId: z.string().regex(UUID_RE),
  /** The SA's current (possibly unsaved) draft, so the revision starts from what is on screen. */
  config: pocConfig,
  target,
  instruction: z.string().trim().max(2000).default(''),
})

export type PocRevision = { kind: 'field'; text: string } | { kind: 'section'; patch: Partial<PocConfig> }

type RevisePlan = {
  task: string[]
  schema: Record<string, unknown>
  resultName: string
  /** Sections may need the Cekat docs; a single text field is faster without them. */
  useDocTools: boolean
  apply: (data: Record<string, unknown>) => PocRevision
}

const PER_ITEM_FIELDS = new Set(['kbTextContent', 'qnaAnswer', 'apiDescription'])

const FIELD_GUIDE: Partial<Record<(typeof POC_REVISE_FIELDS)[number], string>> = {
  agentBehavior: 'It is the full AI Agent Behavior prompt (markdown): identity, tone, rules, flows, limits.',
  welcomeMessage: 'It is the first message the AI sends to the user; keep it short and friendly.',
  agentTransferConditions: 'It lists when the AI hands the chat over to a human agent.',
  kbTextContent: 'It is static knowledge base text in markdown; only facts from the project sources.',
  qnaAnswer: 'It is the answer to a knowledge base question; only facts from the project sources.',
  apiDescription: 'It is the description of an API integration tool: when the AI should call it and what it returns.',
}

const KEEP_REST = 'Apply the SA instruction and keep everything the instruction does not ask to change (same wording, same language). Return the complete revised value, not only the changed parts.'
const NO_INSTRUCTION = 'No specific instruction: improve clarity, completeness and consistency with the project sources and the rest of the POC, without inventing facts.'

const pick = (keys: string[]) => {
  const all = draftSchema.properties as Record<string, unknown>
  return obj(Object.fromEntries(keys.map((k) => [k, all[k]])))
}

const json = (label: string, value: unknown) => `CURRENT ${label.toUpperCase()} (JSON):\n${JSON.stringify(value, null, 2)}`

function sectionPlan(section: PocReviseSection, current: PocConfig, clientName: string): Omit<RevisePlan, 'task' | 'resultName' | 'useDocTools'> & { shown: unknown; extra?: string } {
  switch (section) {
    case 'agent': {
      const keys = ['agentBehavior', 'welcomeMessage', 'agentTransferConditions', 'stopAiAfterHandoff', 'silentAgentHandoff'] as const
      return {
        shown: Object.fromEntries(keys.map((k) => [k, current[k]])),
        schema: pick([...keys]),
        apply: (d) => ({
          kind: 'section',
          patch: {
            agentBehavior: String(d.agentBehavior ?? ''),
            welcomeMessage: String(d.welcomeMessage ?? ''),
            agentTransferConditions: String(d.agentTransferConditions ?? ''),
            stopAiAfterHandoff: d.stopAiAfterHandoff === true,
            silentAgentHandoff: d.silentAgentHandoff === true,
          },
        }),
      }
    }
    case 'labels':
      return { shown: current.labels, schema: pick(['labels']), apply: (d) => ({ kind: 'section', patch: { labels: labelsFromAi(d.labels) } }) }
    case 'pipeline':
      return { shown: current.pipeline.map(({ status, condition }) => ({ status, condition })), schema: pick(['pipeline']), apply: (d) => ({ kind: 'section', patch: { pipeline: pipelineFromAi(d.pipeline) } }) }
    case 'knowledgeBase': {
      const { files, ...kb } = current.knowledgeBase
      return {
        shown: kb,
        extra: files.length ? `Uploaded files (${files.map((f) => f.name).join(', ')}) are kept as they are; do not list them.` : undefined,
        schema: pick(['knowledgeBase']),
        apply: (d) => ({ kind: 'section', patch: { knowledgeBase: knowledgeBaseFromAi(d.knowledgeBase, files) } }),
      }
    }
    case 'apiIntegrations':
      return {
        shown: apiIntegrationsForAi(current.apiIntegrations),
        extra: 'Keep the name of an integration unless the instruction asks to rename it (its API key and webhook are matched by name). aiInputJson is a JSON Schema as a JSON string.',
        schema: pick(['apiIntegrations']),
        apply: (d) => ({ kind: 'section', patch: { apiIntegrations: apiIntegrationsFromAi(d.apiIntegrations, current.apiIntegrations, clientName) } }),
      }
    case 'crm':
      return { shown: { boards: current.crm.boards.map(boardToAi) }, extra: CRM_TASK, schema: obj({ crm: crmSchema }), apply: (d) => ({ kind: 'section', patch: { crm: crmFromAi(d.crm) } }) }
    case 'flow':
      return {
        shown: { flowchart: current.flow.mermaid, happyCases: current.flow.happyCases },
        extra: FLOW_TASK,
        schema: obj(flowFields),
        apply: (d) => ({ kind: 'section', patch: { flow: flowFromAi(d) } }),
      }
  }
}

/** What to ask the model for a target, and how to turn its answer into a revision. Pure, for tests. */
export function revisePlan(t: PocReviseTarget, current: PocConfig, pocName: string, clientName: string): RevisePlan {
  const label = reviseTargetLabel(current, t)
  if (t.kind === 'field') {
    if (PER_ITEM_FIELDS.has(t.field) && !isExistingItem(current, t)) throw new HttpError(400, `That ${FIELD_LABELS[t.field]} no longer exists — refresh and try again`)
    return {
      task: [
        `Revise the "${label}" text of the POC "${pocName}" of this project.`,
        FIELD_GUIDE[t.field] ?? '',
        `CURRENT TEXT:\n<current_text>\n${fieldText(current, t)}\n</current_text>`,
        t.field === 'agentBehavior' ? '' : `For consistency with the rest of the POC:\n${currentPocSummary(current)}`,
        KEEP_REST,
      ].filter(Boolean),
      schema: obj({ text: str('The complete revised text') }),
      resultName: `revised ${label}`,
      useDocTools: false,
      apply: (d) => ({ kind: 'field', text: String(d.text ?? '') }),
    }
  }
  const plan = sectionPlan(t.section, current, clientName)
  return {
    task: [
      `Revise the "${SECTION_LABELS[t.section]}" section of the POC "${pocName}" of this project.`,
      json(SECTION_LABELS[t.section], plan.shown),
      plan.extra ?? '',
      t.section === 'agent' ? '' : `For consistency with the rest of the POC:\n${currentPocSummary(current)}`,
      KEEP_REST,
    ].filter(Boolean),
    schema: plan.schema,
    resultName: `revised ${SECTION_LABELS[t.section]}`,
    useDocTools: true,
    apply: plan.apply,
  }
}

function isExistingItem(current: PocConfig, t: Extract<PocReviseTarget, { kind: 'field' }>): boolean {
  const i = t.index ?? -1
  if (t.field === 'kbTextContent') return !!current.knowledgeBase.textSections[i]
  if (t.field === 'qnaAnswer') return !!current.knowledgeBase.qna[i]
  if (t.field === 'apiDescription') return !!current.apiIntegrations[i]
  return true
}

/** The revision applied to the draft must still be a valid POC (length limits, URLs, names). */
export function validateRevision(current: PocConfig, t: PocReviseTarget, revision: PocRevision): void {
  const next = revision.kind === 'field' && t.kind === 'field' ? withFieldText(current, t, revision.text) : { ...current, ...(revision.kind === 'section' ? revision.patch : {}) }
  const parsed = pocConfig.safeParse(next)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new HttpError(502, `The AI revision is not valid (${issue.path.join('.')}: ${issue.message}) — try again with a narrower instruction.`)
  }
}

export async function revisePoc(body: unknown, out: Stream): Promise<void> {
  const req = input.parse(body)
  const poc = await queryOne<{ project_id: string; name: string; client_name: string; project_name: string }>(
    'select pocs.project_id, pocs.name, p.client_name, p.name as project_name from pocs join projects p on p.id = pocs.project_id where pocs.id = $1',
    [req.pocId],
  )
  if (!poc) throw new HttpError(404, 'POC not found')
  const plan = revisePlan(req.target, req.config, poc.name, poc.client_name || poc.project_name)
  const ctx = await loadProjectContext(poc.project_id)

  const { data } = await runStructured({
    system: [BASE_SYSTEM, renderContextText(ctx)],
    task: [...plan.task, GROUNDING, 'Write in the project language.', `Instruction from the SA: ${req.instruction || NO_INSTRUCTION}`].join('\n\n'),
    schema: plan.schema,
    resultName: plan.resultName,
    useDocTools: plan.useDocTools,
    maxTokens: 32000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })
  const revision = plan.apply(data)
  validateRevision(req.config, req.target, revision)
  out.send({ type: 'result', data: revision })
  out.send({ type: 'done' })
}
