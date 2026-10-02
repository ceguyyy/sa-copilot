// QA step 2 helpers: the AI plays the customer for one step, judges a finished case, and summarises the run.
import { BASE_SYSTEM } from './common.ts'
import { arr, obj, runStructured, str } from './structured.ts'
import type { QaCaseResult, QaPlanStep, QaStepResult } from '../../shared/pocQa.ts'

const MAX_MESSAGE_CHARS = 1_000
/** Keeps the judge prompt bounded when the reference (knowledge) is large. */
const MAX_REFERENCE_CHARS = 120_000

const referenceBlock = (reference: string) =>
  reference.trim() ? `REFERENCE — what the agent should know and do (facts in replies must match it):
${reference.slice(0, MAX_REFERENCE_CHARS)}` : ''
export type Turn = { sent: string; replies: string[] }

const transcript = (turns: Turn[]) => turns.map((t) => `Customer: ${t.sent}\nAgent: ${t.replies.join('\n') || '(no reply)'}`).join('\n\n')

/**
 * The customer message for this step: the scripted one, adapted to what the agent just said (e.g. it asked for the
 * order number first). Falls back to the script when the model gives nothing usable.
 */
export async function testerMessage(goal: string, scripted: string, turns: Turn[], data: Record<string, string>): Promise<string> {
  if (!turns.length) return scripted
  const { data: out } = await runStructured({
    system: [BASE_SYSTEM, 'You play the CUSTOMER in a QA test of a Cekat AI customer-service agent. Stay in character; write only what the customer types.'],
    task: [
      `Goal of this happy case: ${goal || '(none)'}`,
      `Conversation so far:\n${transcript(turns)}`,
      `Scripted next customer message: ${scripted}`,
      `Customer data you may use: ${JSON.stringify(data)}`,
      'Write the next customer message. Keep the scripted intent and wording where it still fits; if the agent just asked for something (a number, a choice, a confirmation), answer that within the same message using the data. One short chat message, same language as the script.',
    ].join('\n\n'),
    schema: obj({ message: str('The customer message to send') }),
    resultName: 'customer message',
    maxTokens: 2000,
  })
  const message = typeof out.message === 'string' ? out.message.trim().slice(0, MAX_MESSAGE_CHARS) : ''
  return message || scripted
}

type AiVerdict = { verdict?: unknown; reason?: unknown }

/** Pure: the judged steps in the stored shape. No reply stays no_reply; an expected action always needs a manual tick. */
export function stepsFromJudge(steps: QaPlanStep[], turns: Turn[], judged: AiVerdict[]): QaStepResult[] {
  return steps.slice(0, turns.length).map((step, i) => {
    const turn = turns[i]
    const j = judged[i] ?? {}
    const hasReply = turn.replies.length > 0
    return {
      sent: turn.sent,
      replies: turn.replies,
      expectedAi: step.expectedAi,
      expectedAction: step.expectedAction,
      verdict: !hasReply ? 'no_reply' : j.verdict === 'pass' ? 'pass' : 'fail',
      reason: !hasReply ? 'The agent did not reply in time.' : typeof j.reason === 'string' ? j.reason.trim().slice(0, 2_000) : '',
      actionCheck: step.expectedAction.trim() ? 'pending' : 'none',
    }
  })
}

/** Judges each reply of a finished case against the expected AI reply and the reference. */
export async function judgeCase(title: string, goal: string, steps: QaPlanStep[], turns: Turn[], reference = ''): Promise<QaStepResult[]> {
  if (!turns.length) return []
  const items = turns.map((t, i) => ({ step: i + 1, customer: t.sent, agentReplies: t.replies, expectedReply: steps[i]?.expectedAi ?? '' }))
  const { data } = await runStructured({
    system: [BASE_SYSTEM, 'You are a strict but fair QA reviewer of a Cekat AI customer-service agent.'],
    task: [
      referenceBlock(reference),
      `Happy case: ${title}. Goal: ${goal || '(none)'}`,
      `Steps (JSON):\n${JSON.stringify(items, null, 2)}`,
      'For every step, judge whether the agent\'s replies meet the expected reply in substance (same intent, correct facts, asks for the right thing). Wording may differ. Fail it when facts are wrong or contradict the reference, it ignores the request, asks the wrong thing, or contradicts the expected behaviour. Give a one-sentence reason in the project language.',
    ].join('\n\n'),
    schema: obj({ steps: arr(obj({ verdict: { type: 'string', enum: ['pass', 'fail'] }, reason: str('Why, one sentence') }), 'One per step, in order') }),
    resultName: 'QA verdicts',
    maxTokens: 8000,
  })
  return stepsFromJudge(steps, turns, Array.isArray(data.steps) ? (data.steps as AiVerdict[]) : [])
}

/** Overall summary and the instruction to revise the POC Agent with (empty when everything passed). */
export async function summarizeRun(cases: QaCaseResult[], reference: string): Promise<{ summary: string; revisionPrompt: string }> {
  const { data } = await runStructured({
    system: [BASE_SYSTEM],
    task: [
      referenceBlock(reference),
      `QA RESULTS ON THE CEKAT LIVECHAT (JSON):\n${JSON.stringify(cases, null, 2)}`,
      'Summarise the QA run for the SA in the project language: what works, what failed and the likely cause (prompt, knowledge base, API tool, handoff rule). Then write revisionPrompt: a concrete instruction to revise the Cekat AI Agent (behavior prompt, labels, handoff, knowledge, API descriptions) so the failed steps pass, referring to the exact failures. Leave revisionPrompt empty when every step passed.',
    ].join('\n\n'),
    schema: obj({ summary: str('Short summary in markdown'), revisionPrompt: str('Instruction for Revise with AI; empty when all passed') }),
    resultName: 'QA summary',
    maxTokens: 8000,
  })
  return { summary: typeof data.summary === 'string' ? data.summary.trim() : '', revisionPrompt: typeof data.revisionPrompt === 'string' ? data.revisionPrompt.trim() : '' }
}
