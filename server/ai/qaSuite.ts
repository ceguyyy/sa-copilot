// QA Testing suites (no project): AI writes test cases from the uploaded knowledge, and the shared planner/runner
// play them on the livechat. The knowledge is the reference the replies are judged against.
import { z } from 'zod'
import { query, queryOne } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { BASE_SYSTEM, toolEvents } from './common.ts'
import type { Stream } from './stream.ts'
import { arr, obj, runStructured, str } from './structured.ts'
import { buildQaPlan, type CaseScript } from './pocQaPrepare.ts'
import { executeQaRun, livechatUrlField, runFields } from '../qa/runner.ts'
import { suiteCases } from '../routes/qaSuites.ts'

const suiteId = z.string().regex(UUID_RE)

/** Bounds the knowledge put in one prompt. */
const MAX_REFERENCE_CHARS = 400_000

type SuiteRow = { id: string; name: string; context: string; cases: CaseScript[] }

async function loadSuite(id: string): Promise<{ suite: SuiteRow; reference: string }> {
  const suite = await queryOne<SuiteRow>('select id, name, context, cases from qa_suites where id = $1', [id])
  if (!suite) throw new HttpError(404, 'QA suite not found')
  const knowledge = await query<{ name: string; extracted_text: string }>('select name, extracted_text from qa_suite_knowledge where suite_id = $1 order by created_at', [id])
  const reference = [
    suite.context.trim() && `ABOUT THE AGENT UNDER TEST:\n${suite.context.trim()}`,
    ...knowledge.map((k) => `### Knowledge: ${k.name}\n${k.extracted_text}`),
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_REFERENCE_CHARS)
  return { suite, reference }
}

const caseSchema = obj({
  cases: arr(
    obj({
      title: str('Scenario name, e.g. "Tanya syarat haji reguler"'),
      goal: str('What the customer achieves at the end'),
      steps: arr(
        obj({
          user: str('Exact message the customer types'),
          ai: str('Expected agent reply, summarised, with the facts from the knowledge it must state'),
          action: str('Expected action the chat cannot show (label, handoff to human, API tool); empty if none'),
        }),
      ),
    }),
  ),
})

const generateInput = z.object({
  suiteId,
  count: z.number().int().min(1).max(20).default(5),
  instruction: z.string().max(2_000).default(''),
  mode: z.enum(['append', 'replace']).default('append'),
})

/** Writes test cases from the suite's knowledge and saves them on the suite (appended or replacing). */
export async function generateSuiteCases(body: unknown, out: Stream): Promise<void> {
  const req = generateInput.parse(body)
  const { suite, reference } = await loadSuite(req.suiteId)
  if (!reference.trim()) throw new HttpError(400, 'Add knowledge (upload a file or paste text) before generating cases.')
  const existing = req.mode === 'append' ? suite.cases : []
  const { data } = await runStructured({
    system: [BASE_SYSTEM, reference],
    task: [
      `Write ${req.count} QA test cases for a Cekat AI customer-service agent that must answer from the knowledge above.`,
      'Each case is a realistic customer conversation of 2-5 steps: what the customer types (in the knowledge language), the expected reply with the exact facts from the knowledge it must state, and the expected action when the chat cannot show it. Cover different topics, including at least one question whose answer is NOT in the knowledge (the agent should say it does not know or hand over, not invent).',
      existing.length ? `Do not repeat these existing cases: ${existing.map((c) => c.title).join('; ')}` : '',
      req.instruction && `Instruction from the tester: ${req.instruction}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    schema: caseSchema,
    resultName: 'QA test cases',
    useDocTools: false,
    maxTokens: 16000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })
  const generated = suiteCases.parse(Array.isArray(data.cases) ? data.cases : []).filter((c) => c.title && c.steps.length)
  if (!generated.length) throw new HttpError(502, 'The model returned no test case — try again or pick another model.')
  const cases = [...existing, ...generated].slice(0, 50)
  const row = await queryOne('update qa_suites set cases = $2, updated_at = now() where id = $1 returning *', [req.suiteId, JSON.stringify(cases)])
  out.send({ type: 'result', data: row })
  out.send({ type: 'done' })
}

const prepareInput = z.object({ suiteId, livechatUrl: livechatUrlField, caseIndexes: z.array(z.number().int().min(0).max(49)).max(50).optional() })

/** Plans a run of the chosen cases (all when none chosen). */
export async function prepareSuiteQa(body: unknown, out: Stream): Promise<void> {
  const req = prepareInput.parse(body)
  const { suite, reference } = await loadSuite(req.suiteId)
  const chosen = req.caseIndexes?.length ? req.caseIndexes.map((i) => suite.cases[i]).filter(Boolean) : suite.cases
  if (!chosen.length) throw new HttpError(400, 'No test cases yet — write or generate some first.')
  const plan = await buildQaPlan(req.livechatUrl, chosen, [BASE_SYSTEM, reference], out)
  out.send({ type: 'result', data: plan })
  out.send({ type: 'done' })
}

const runInput = z.object({ suiteId, ...runFields })

export async function runSuiteQa(body: unknown, out: Stream): Promise<void> {
  const req = runInput.parse(body)
  const { reference } = await loadSuite(req.suiteId)
  const report = await executeQaRun(req, reference, out)
  const row = await queryOne('insert into qa_suite_runs (suite_id, report) values ($1, $2) returning *', [req.suiteId, report])
  out.send({ type: 'result', data: row })
  out.send({ type: 'done' })
}
