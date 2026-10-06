// Drafts demo scenarios (the Healthcare demo app's chat scenarios) for a project's use cases.
import { z } from 'zod'
import { query } from '../db.ts'
import { cleanScenario } from '../demo.ts'
import { UUID_RE } from '../http.ts'
import { BASE_SYSTEM, toolEvents } from './common.ts'
import { loadProjectContext, renderContextText } from './context.ts'
import type { Stream } from './stream.ts'
import { arr, obj, runStructured, str } from './structured.ts'

const input = z.object({
  projectId: z.string().regex(UUID_RE),
  count: z.number().int().min(1).max(8).default(4),
  instruction: z.string().max(2000).default(''),
})

const bool = { type: 'boolean' }

const stepSchema = obj({
  userReply: str('What the patient/customer types or taps in this step (for OUTBOUND scenarios the first step can be their reply to the outbound message)'),
  aiResponse: str('The AI agent reply — realistic, short, may use *bold* and line breaks'),
  chips: arr(str('Quick-reply button text'), '0–4 quick replies shown under the reply'),
  enableCard: bool,
  card: obj({ title: str(), sub: str(), items: arr(obj({ label: str(), val: str() })), status: str('e.g. CONFIRMED, PROCESSED') }),
  enableFlow: bool,
  flow: obj({
    title: str('WhatsApp Flow form title'),
    description: str(),
    buttonText: str(),
    fields: arr(obj({ id: str('snake_case'), label: str(), type: { type: 'string', enum: ['text', 'select', 'date', 'radio', 'checkbox'] }, placeholder: str(), options: arr(str()) })),
    submitResponseText: str(),
  }),
})

export const scenarioSchema = obj({
  name: str('Short name, 2–4 words'),
  title: str('Full scenario title'),
  tag: str('e.g. "Appointment", "Triage", "Lab Results"'),
  triggerType: { type: 'string', enum: ['INBOUND_USER', 'OUTBOUND_SYSTEM'] },
  outboundPill: str('For OUTBOUND_SYSTEM: the trigger label, e.g. "H-1 Reminder"; empty otherwise'),
  description: str('What the demo shows, 1–2 sentences'),
  cekatComponents: arr(str('Cekat feature used, e.g. "AI Agent", "WhatsApp Flow", "CRM Pipeline"')),
  apiScopes: arr(str('Client API/system touched, e.g. "HIS: GET /schedule"')),
  ruleNote: str('Business rule or guardrail the scenario demonstrates'),
  stepsDetail: arr(str('One line per step explaining what happens behind the scenes')),
  initialText: str('First message: the patient opener for INBOUND, or the system message for OUTBOUND'),
  steps: arr(stepSchema, '2–6 conversation steps'),
})

const schema = obj({ scenarios: arr(scenarioSchema) })

export async function generateDemoScenarios(body: unknown, out: Stream): Promise<void> {
  const req = input.parse(body)
  const ctx = await loadProjectContext(req.projectId)
  const { data } = await runStructured({
    system: [BASE_SYSTEM, renderContextText(ctx)],
    task: [
      `Create ${req.count} demo scenarios for the Cekat Healthcare demo app, showing THIS client's most important use cases (take them from the requirements, the pitch deck mockups and the TOR).`,
      'Each scenario is a realistic WhatsApp conversation between a patient/customer and the client\'s AI agent, in the project language, with fake but plausible names and data. Use a card (enableCard) when showing a booking/result summary and a WhatsApp Flow form (enableFlow) when collecting several fields; otherwise set them false and leave their contents empty.',
      'Only show Cekat features that exist (check the documentation tools when unsure). Mix INBOUND_USER and OUTBOUND_SYSTEM (reminders, results) where it fits.',
      req.instruction && `Instruction from the SA: ${req.instruction}`,
    ]
      .filter(Boolean)
      .join('\n'),
    schema,
    resultName: 'demo scenarios',
    useDocTools: true,
    maxTokens: 32000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })

  const raw = Array.isArray(data.scenarios) ? data.scenarios : []
  let added = 0
  const skipped: string[] = []
  for (const s of raw) {
    try {
      await query('insert into demo_scenarios (project_id, payload) values ($1, $2)', [req.projectId, cleanScenario(s)])
      added++
    } catch (e) {
      skipped.push(e instanceof Error ? e.message.slice(0, 120) : String(e))
    }
  }
  out.send({ type: 'result', data: { added, skipped: skipped.length } })
  out.send({ type: 'done' })
}
