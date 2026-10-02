// QA step 1: from the POC's happy cases and the livechat's pre-chat form, build the run plan. The AI finds the data
// each case needs ({{key}} in the messages) with realistic dummies; the SA fills or keeps them before running.
import { z } from 'zod'
import { queryOne } from '../db.ts'
import { HttpError, UUID_RE } from '../http.ts'
import { pocConfig } from '../validation.ts'
import { BASE_SYSTEM, toolEvents } from './common.ts'
import { loadProjectContext, renderContextText } from './context.ts'
import type { Stream } from './stream.ts'
import { arr, obj, runStructured, str } from './structured.ts'
import { launchBrowser, lockToLivechat, openLivechat, readContactForm } from '../qa/livechat.ts'
import { type QaContactField, type QaPlan, type QaPlanCase, dummyForLabel, isLivechatUrl } from '../../shared/pocQa.ts'

const input = z.object({
  pocId: z.string().regex(UUID_RE),
  livechatUrl: z.string().refine(isLivechatUrl, 'Livechat link must be an https://live.cekat.ai/… link'),
})

const MAX_VARIABLES = 12

const schema = obj({
  cases: arr(
    obj({
      variables: arr(
        obj({
          key: str('snake_case name, e.g. order_number'),
          label: str('What it is, for the SA, e.g. "Nomor pesanan"'),
          dummy: str('Realistic dummy value in the project format, e.g. "INV-2026-00123"'),
        }),
        'Data the customer must give in this case; empty when none',
      ),
      messages: arr(str('The step\'s customer message with {{key}} where that data goes'), 'One per step, in the same order'),
    }),
    'One per happy case, in the same order',
  ),
})

const TASK = [
  'Prepare these happy cases to be run by a QA tester on the Cekat livechat of the AI agent.',
  'For each case, find the data the customer has to provide (order or booking number, NIK, member id, date, product, address…). Name each one with a snake_case key, write a short label for the SA and a realistic dummy value that fits the project (formats from the sources when known).',
  'Rewrite each step message with {{key}} where that data appears; keep everything else word for word. Do not include the customer\'s name or phone: the livechat pre-chat form asks those.',
].join('\n')

async function readForm(url: string): Promise<QaContactField[]> {
  const browser = await launchBrowser(true)
  try {
    const context = await browser.newContext()
    await lockToLivechat(context)
    const page = await context.newPage()
    await openLivechat(page, url)
    return await readContactForm(page)
  } finally {
    await browser.close()
  }
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])

/** A case to plan: the happy-case shape (POC happy cases and QA Testing suite cases). */
export type CaseScript = { title: string; goal: string; steps: { user: string; ai: string; action: string }[] }

/**
 * Builds the run plan for any set of cases: reads the livechat's pre-chat form, then the AI finds the data each
 * case needs. `system` carries what the AI knows about the agent (project sources or suite knowledge).
 */
export async function buildQaPlan(livechatUrl: string, cases: CaseScript[], system: string[], out: Stream): Promise<QaPlan> {
  out.send({ type: 'status', text: 'Opening the livechat to read its form…' })
  const contactFields = await readForm(livechatUrl)

  out.send({ type: 'status', text: 'Finding the data each case needs…' })
  const { data } = await runStructured({
    system,
    task: [TASK, `CASES (JSON):\n${JSON.stringify(cases.map((c) => ({ title: c.title, goal: c.goal, messages: c.steps.map((s) => s.user) })), null, 2)}`, 'Write in the language of the cases.'].join('\n\n'),
    schema,
    resultName: 'QA data plan',
    maxTokens: 32000,
    onProgress: (chars) => out.send({ type: 'progress', chars }),
    onToolUse: toolEvents(out),
  })

  const aiCases = records(data.cases)
  const planCases: QaPlanCase[] = cases.map((c, i) => {
    const ai = aiCases[i] ?? {}
    const messages = Array.isArray(ai.messages) ? ai.messages : []
    const variables = records(ai.variables)
      .slice(0, MAX_VARIABLES)
      .map((v) => ({ key: text(v.key, 60).replace(/[^\w.-]/g, '_'), label: text(v.label, 200), dummy: text(v.dummy, 500), value: '' }))
      .filter((v) => v.key)
    return {
      title: c.title,
      goal: c.goal,
      contact: Object.fromEntries(contactFields.map((f) => [f.label, dummyForLabel(f.label, i, f.placeholder)])),
      variables,
      steps: c.steps.map((s, j) => ({ message: text(messages[j], 5_000) || s.user, expectedAi: s.ai, expectedAction: s.action })),
    }
  })
  return { livechatUrl, contactFields, cases: planCases }
}

export async function prepareQa(body: unknown, out: Stream): Promise<void> {
  const req = input.parse(body)
  const poc = await queryOne<{ project_id: string; config: unknown }>('select project_id, config from pocs where id = $1', [req.pocId])
  if (!poc) throw new HttpError(404, 'POC not found')
  const cases = pocConfig.parse(poc.config ?? {}).flow.happyCases
  if (!cases.length) throw new HttpError(400, 'No happy cases yet — generate them in Flow & Happy Case first.')
  const ctx = await loadProjectContext(poc.project_id)
  const plan = await buildQaPlan(req.livechatUrl, cases, [BASE_SYSTEM, renderContextText(ctx)], out)
  out.send({ type: 'result', data: plan })
  out.send({ type: 'done' })
}
