// POC Agent QA: run the happy cases against a Cekat Web Livechat with Playwright, then judge, summarise and
// propose a revision. Shared shapes and pure helpers (the browser and AI work live on the server).

/** A field of the livechat's pre-chat form ("Mulai Percakapan"), as read from the page. */
export type QaContactField = { label: string; placeholder: string; required: boolean }

/** Data a happy case needs, e.g. an order number; used in step messages as {{key}}. */
export type QaVariable = { key: string; label: string; dummy: string; value: string }

export type QaPlanStep = { message: string; expectedAi: string; expectedAction: string }

export type QaPlanCase = {
  title: string
  goal: string
  /** Pre-chat form values by field label; each case is its own conversation, so each gets its own contact. */
  contact: Record<string, string>
  variables: QaVariable[]
  steps: QaPlanStep[]
}

export type QaPlan = { livechatUrl: string; contactFields: QaContactField[]; cases: QaPlanCase[] }

/** pass/fail judge the AI reply; no_reply = the agent did not answer in time. */
export type QaVerdict = 'pass' | 'fail' | 'no_reply'

/** Expected actions (label, pipeline, handoff, API tool) are not visible in the livechat: the SA ticks them. */
export type QaActionCheck = 'none' | 'pending' | 'pass' | 'fail'

export type QaStepResult = {
  sent: string
  replies: string[]
  expectedAi: string
  expectedAction: string
  verdict: QaVerdict
  reason: string
  actionCheck: QaActionCheck
}

export type QaCaseResult = { title: string; goal: string; error: string; steps: QaStepResult[] }

export type QaReport = {
  livechatUrl: string
  startedAt: string
  finishedAt: string
  cases: QaCaseResult[]
  summary: string
  /** Instruction for "Revise with AI" on the POC Agent; empty when nothing needs to change. */
  revisionPrompt: string
}

/** A saved run (poc_qa_runs or qa_suite_runs). */
export type QaRunRow = { id: string; report: QaReport; created_at: string }

const LIVECHAT_HOSTS = ['live.cekat.ai']

/** Only https Cekat livechat pages may be opened by the test browser. */
export function isLivechatUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return url.protocol === 'https:' && LIVECHAT_HOSTS.includes(url.hostname)
}

export const fillVariables = (text: string, values: Record<string, string>): string =>
  text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => (key in values ? values[key] : match))

export const variableValues = (variables: QaVariable[]): Record<string, string> =>
  Object.fromEntries(variables.map((v) => [v.key, v.value || v.dummy]))

const pad = (n: number, width: number) => String(n).padStart(width, '0')

/** A plausible dummy for a pre-chat field from its label; `seed` keeps phone numbers unique per case. */
export function dummyForLabel(label: string, seed = 0, placeholder = ''): string {
  const l = `${label} ${placeholder}`.toLowerCase()
  if (/phone|telp|hp|whatsapp|wa\b|nomor/.test(l)) return `62812${pad((Date.now() + seed * 7919) % 100_000_000, 8)}`
  if (/mail/.test(l)) return `qa.tester${seed || ''}@example.com`
  if (/dob|lahir|birth|tanggal|date|ddmm/.test(l)) return /ddmm/.test(l) ? '17081990' : '1990-08-17'
  if (/name|nama/.test(l)) return `QA Tester ${seed + 1}`
  if (/kota|city/.test(l)) return 'Jakarta'
  return 'QA test'
}

export type QaTotals = { steps: number; pass: number; fail: number; actionsPending: number; actionsPass: number; actionsFail: number }

export function reportTotals(report: QaReport): QaTotals {
  const steps = report.cases.flatMap((c) => c.steps)
  const count = (fn: (s: QaStepResult) => boolean) => steps.filter(fn).length
  return {
    steps: steps.length,
    pass: count((s) => s.verdict === 'pass'),
    fail: count((s) => s.verdict !== 'pass'),
    actionsPending: count((s) => s.actionCheck === 'pending'),
    actionsPass: count((s) => s.actionCheck === 'pass'),
    actionsFail: count((s) => s.actionCheck === 'fail'),
  }
}

/** What to send to "Revise with AI" on the POC Agent: the AI's prompt plus every failed step as evidence. */
export function revisionInstruction(report: QaReport): string {
  const failed = report.cases.flatMap((c) =>
    c.steps
      .filter((s) => s.verdict !== 'pass' || s.actionCheck === 'fail')
      .map((s) => `- [${c.title}] Customer: "${s.sent}" → AI: "${s.replies.join(' / ') || '(no reply)'}". Expected: ${s.expectedAi}${s.expectedAction ? ` (action: ${s.expectedAction})` : ''}. Problem: ${s.reason || (s.actionCheck === 'fail' ? 'expected action did not happen' : 'no reply')}`),
  )
  return [report.revisionPrompt, failed.length ? `Failed QA steps on the Cekat livechat:\n${failed.join('\n')}` : ''].filter(Boolean).join('\n\n')
}

// ---------- QA Testing suites (sidebar, no project) ----------

/** A test case in the happy-case shape: what the customer types, the expected reply and the expected action. */
export type QaSuiteCase = { title: string; goal: string; steps: { user: string; ai: string; action: string }[] }

export type QaSuite = { id: string; name: string; livechat_url: string; context: string; cases: QaSuiteCase[]; created_at: string; updated_at: string }

/** Knowledge entry of a suite (its text is kept server-side; `chars` is its length). */
export type QaKnowledge = { id: string; suite_id: string; name: string; mime_type: string | null; size_bytes: number | null; chars: number; created_at: string }
