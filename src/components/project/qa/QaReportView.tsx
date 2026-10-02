import clsx from 'clsx'
import type { ReactNode } from 'react'
import { FileSpreadsheet, FileText, Wand2 } from 'lucide-react'
import { Badge, Button, Select, Textarea } from '../../ui'
import { CopyButton } from '../../CopyButton'
import { Markdown } from '../../Markdown'
import { downloadBlob, slugify } from '../../../lib/download'
import { exportQaReportDocx, exportQaReportXlsx } from '../../../../shared/export/qaReport.ts'
import { type QaActionCheck, type QaRunRow, type QaStepResult, reportTotals, revisionInstruction } from '../../../../shared/pocQa.ts'

type Props = {
  run: QaRunRow
  /** POC or suite name: report heading and file name. */
  title: string
  onActionCheck: (caseIndex: number, stepIndex: number, check: Exclude<QaActionCheck, 'none'>) => void
  /** POC only: run "Revise with AI" on the POC Agent with the prompt, and its status / diff preview. */
  revise?: { onRevise: (instruction: string) => void; isDisabled: boolean; preview: ReactNode }
}

const VERDICT: Record<QaStepResult['verdict'], { label: string; tone: 'ok' | 'ember' | 'warn' }> = {
  pass: { label: 'Pass', tone: 'ok' },
  fail: { label: 'Fail', tone: 'ember' },
  no_reply: { label: 'No reply', tone: 'warn' },
}

/** One QA run: totals, every step with its verdict and reason, manual action ticks, the AI summary and revision prompt. */
export function QaReportView({ run, title, onActionCheck, revise }: Props) {
  const { report } = run
  const totals = reportTotals(report)
  const instruction = revisionInstruction(report)
  const fileBase = `${slugify(title || 'qa')}-qa-report-${run.created_at.slice(0, 10)}`
  const download = async (format: 'xlsx' | 'docx') =>
    downloadBlob(format === 'xlsx' ? await exportQaReportXlsx(report, title) : await exportQaReportDocx(report, title), `${fileBase}.${format}`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="ok">{totals.pass} pass</Badge>
        <Badge tone="ember">{totals.fail} fail</Badge>
        {totals.actionsPending > 0 && <Badge tone="warn">{totals.actionsPending} actions to check</Badge>}
        {totals.actionsFail > 0 && <Badge tone="ember">{totals.actionsFail} actions failed</Badge>}
        <span className="font-mono text-[11px] text-muted">{new Date(run.created_at).toLocaleString()}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="outline" icon={<FileSpreadsheet className="size-4" />} onClick={() => void download('xlsx')} title="Summary sheet + one row per step">
            Excel
          </Button>
          <Button variant="outline" icon={<FileText className="size-4" />} onClick={() => void download('docx')} title="Report with summary, tables per case and the revision prompt">
            Word
          </Button>
        </div>
      </div>

      {report.summary && (
        <div className="rounded-lg border border-line bg-panel p-3">
          <h6 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">AI summary</h6>
          <Markdown>{report.summary}</Markdown>
        </div>
      )}

      {report.cases.map((c, i) => (
        <details key={`${i}-${c.title}`} open className="rounded-lg border border-line bg-panel p-3">
          <summary className="cursor-pointer font-display text-sm font-semibold">
            {i + 1}. {c.title}{' '}
            <span className="font-mono text-[11px] font-normal text-muted">
              · {c.steps.filter((s) => s.verdict === 'pass').length}/{c.steps.length} pass
            </span>
          </summary>
          {c.error && <p className="mt-2 text-xs text-bad">Stopped: {c.error}</p>}
          <ol className="mt-3 space-y-3">
            {c.steps.map((s, j) => (
              <li key={j} className={clsx('space-y-1 rounded-md border-l-4 bg-paper p-2 text-xs', s.verdict === 'pass' ? 'border-l-ok' : s.verdict === 'fail' ? 'border-l-bad' : 'border-l-warn')}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={VERDICT[s.verdict].tone}>{VERDICT[s.verdict].label}</Badge>
                  <span className="font-medium text-ink">Customer: {s.sent}</span>
                </div>
                <p className="whitespace-pre-wrap text-ink">Agent: {s.replies.join('\n') || '(no reply)'}</p>
                <p className="text-muted">Expected: {s.expectedAi}</p>
                {s.reason && <p className="text-muted">Why: {s.reason}</p>}
                {s.actionCheck !== 'none' && (
                  <label className="flex flex-wrap items-center gap-2">
                    <span className="text-muted">Expected action (check in Cekat): {s.expectedAction}</span>
                    <Select aria-label="Action check" value={s.actionCheck} onChange={(e) => onActionCheck(i, j, e.target.value as Exclude<QaActionCheck, 'none'>)} className="!w-auto py-1 text-xs">
                      <option value="pending">Not checked</option>
                      <option value="pass">Happened</option>
                      <option value="fail">Did not happen</option>
                    </Select>
                  </label>
                )}
              </li>
            ))}
          </ol>
        </details>
      ))}

      <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
        <h6 className="text-xs font-semibold uppercase tracking-wider text-muted">Revision prompt</h6>
        {instruction ? (
          <>
            <Textarea readOnly rows={8} value={instruction} className="font-mono text-xs" />
            <div className="flex flex-wrap justify-end gap-2">
              <CopyButton text={instruction} label="Copy prompt" />
              {revise && (
                <Button variant="ai" icon={<Wand2 className="size-4" />} disabled={revise.isDisabled} onClick={() => revise.onRevise(instruction)}>
                  Revise AI Agent with this
                </Button>
              )}
            </div>
            {revise?.preview}
          </>
        ) : (
          <p className="text-sm text-ok">Every step passed — nothing to revise.</p>
        )}
      </div>
    </div>
  )
}
