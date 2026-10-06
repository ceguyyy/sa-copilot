// Shared QA runner (POC Agent QA and the QA Testing page): plays every case on the Cekat livechat — one fresh
// browser session = one conversation per case — judges the replies against a reference, and summarises.
// Messages go to the real inbox of that livechat.
import { z } from 'zod'
import type { Browser } from 'playwright-core'
import { HttpError } from '../http.ts'
import type { Stream } from '../ai/stream.ts'
import { type Turn, judgeCase, summarizeRun, testerMessage } from '../ai/pocQaJudge.ts'
import { launchBrowser, lockToLivechat, openLivechat, sendAndWait, startChat } from './livechat.ts'
import { type QaCaseResult, type QaPlanCase, type QaReport, fillVariables, isLivechatUrl, variableValues } from '../../shared/pocQa.ts'

const short = (max: number) => z.string().max(max)
const planCase = z.object({
  title: short(200),
  goal: short(2_000),
  contact: z.record(short(200), short(500)),
  variables: z.array(z.object({ key: short(60), label: short(200), dummy: short(500), value: short(500) })).max(20),
  steps: z.array(z.object({ message: short(5_000), expectedAi: short(5_000), expectedAction: short(2_000) })).max(40),
})

export const livechatUrlField = z.string().refine(isLivechatUrl, 'Livechat link must be an https://live.cekat.ai/… link')

/** The run request every QA endpoint accepts (plus its own owner id). */
export const runFields = {
  livechatUrl: livechatUrlField,
  // A suite holds up to 50 cases; the SA picks which of them run.
  cases: z.array(planCase).min(1).max(50),
  headless: z.boolean().default(false),
  /** Let the AI adapt each scripted message to the agent's last reply. */
  adaptive: z.boolean().default(true),
}
const runRequest = z.object(runFields)
export type RunRequest = z.infer<typeof runRequest>

type Send = (obj: unknown) => void

const STOPPED = 'Stopped by the SA'

/** One QA run at a time (it drives a real inbox); Stop is checked before every step. */
let active: { isStopped: boolean } | null = null

/** Asks the running QA run to stop after the current step; false when nothing is running. */
export function stopQa(): boolean {
  if (!active) return false
  active.isStopped = true
  return true
}

const isStopped = () => !!active?.isStopped

async function playCase(browser: Browser, url: string, c: QaPlanCase, index: number, adaptive: boolean, send: Send): Promise<{ turns: Turn[]; error: string }> {
  const context = await browser.newContext()
  const turns: Turn[] = []
  try {
    await lockToLivechat(context)
    const page = await context.newPage()
    send({ type: 'status', text: `Case ${index + 1}: opening the livechat…` })
    await openLivechat(page, url)
    await startChat(page, c.contact)
    const data = variableValues(c.variables)
    for (const [j, step] of c.steps.entries()) {
      if (isStopped()) return { turns, error: STOPPED }
      const scripted = fillVariables(step.message, data)
      const message = adaptive ? await testerMessage(c.goal, scripted, turns, data).catch(() => scripted) : scripted
      send({ type: 'status', text: `Case ${index + 1}, step ${j + 1}: waiting for the agent…` })
      const replies = await sendAndWait(page, message)
      turns.push({ sent: message, replies })
      send({ type: 'step', caseIndex: index, stepIndex: j, sent: message, replies })
      // Without a reply the rest of the script no longer makes sense.
      if (!replies.length) break
    }
    return { turns, error: '' }
  } catch (e) {
    return { turns, error: e instanceof Error ? e.message : String(e) }
  } finally {
    await context.close().catch(() => {})
  }
}

/**
 * Runs the cases and returns the judged report. `reference` is what the agent should know and do (the POC
 * configuration, or the suite's knowledge): the judge checks facts against it.
 */
export async function executeQaRun(req: RunRequest, reference: string, out: Stream): Promise<QaReport> {
  if (active) throw new HttpError(409, 'A QA run is already in progress — wait for it or press Stop.')
  active = { isStopped: false }
  try {
    const startedAt = new Date().toISOString()
    const cases: QaCaseResult[] = []
    const browser = await launchBrowser(req.headless)
    try {
      for (const [i, c] of req.cases.entries()) {
        if (isStopped()) break
        const { turns, error } = await playCase(browser, req.livechatUrl, c, i, req.adaptive, out.send)
        out.send({ type: 'status', text: `Case ${i + 1}: judging the replies…` })
        const steps = await judgeCase(c.title, c.goal, c.steps, turns, reference)
        cases.push({ title: c.title, goal: c.goal, error, steps })
      }
    } finally {
      await browser.close().catch(() => {})
    }
    out.send({ type: 'status', text: 'Writing the summary and revision prompt…' })
    const { summary, revisionPrompt } = await summarizeRun(cases, reference)
    return { livechatUrl: req.livechatUrl, startedAt, finishedAt: new Date().toISOString(), cases, summary, revisionPrompt }
  } finally {
    active = null
  }
}
