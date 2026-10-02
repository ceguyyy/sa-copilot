// QA run report downloads: Excel (Summary + one Results row per step) and Word (from the report's markdown).
import { type QaReport, type QaStepResult, reportTotals, revisionInstruction } from '../pocQa.ts'
import { markdownToDocx } from './docx.ts'

const VERDICT_LABEL: Record<QaStepResult['verdict'], string> = { pass: 'Pass', fail: 'Fail', no_reply: 'No reply' }
const ACTION_LABEL: Record<QaStepResult['actionCheck'], string> = { none: '', pending: 'Not checked', pass: 'Happened', fail: 'Did not happen' }

const when = (iso: string) => (iso ? new Date(iso).toLocaleString() : '')

/** A markdown table cell: pipes escaped, line breaks as <br>. */
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')

/** The whole report as markdown (also the source of the Word file). */
export function qaReportMarkdown(report: QaReport, title: string): string {
  const t = reportTotals(report)
  const lines = [
    `# QA Report — ${title}`,
    `Livechat: ${report.livechatUrl}  `,
    `Run: ${when(report.startedAt)} – ${when(report.finishedAt)}`,
    '',
    '| Steps | Pass | Fail | Actions to check | Actions passed | Actions failed |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${t.steps} | ${t.pass} | ${t.fail} | ${t.actionsPending} | ${t.actionsPass} | ${t.actionsFail} |`,
    '',
    '## Summary',
    report.summary || '_No summary._',
  ]
  for (const [i, c] of report.cases.entries()) {
    lines.push('', `## ${i + 1}. ${c.title}`)
    if (c.goal) lines.push(`Goal: ${c.goal}`)
    if (c.error) lines.push(`**Stopped:** ${c.error}`)
    lines.push('', '| # | Customer | Agent reply | Expected | Verdict | Why | Expected action | Action check |', '| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const [j, s] of c.steps.entries()) {
      lines.push(
        `| ${j + 1} | ${cell(s.sent)} | ${cell(s.replies.join('\n') || '(no reply)')} | ${cell(s.expectedAi)} | ${VERDICT_LABEL[s.verdict]} | ${cell(s.reason)} | ${cell(s.expectedAction)} | ${ACTION_LABEL[s.actionCheck]} |`,
      )
    }
  }
  const prompt = revisionInstruction(report)
  lines.push('', '## Revision prompt', prompt || '_Every step passed — nothing to revise._')
  return lines.join('\n')
}

export function exportQaReportDocx(report: QaReport, title: string): Promise<Blob> {
  return markdownToDocx(`QA Report — ${title}`, qaReportMarkdown(report, title))
}

const FILL = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
const HEADER_FILL = FILL('FF1F3B34')
const VERDICT_FILL: Record<QaStepResult['verdict'], ReturnType<typeof FILL>> = { pass: FILL('FFD9F2E3'), fail: FILL('FFF9D9D2'), no_reply: FILL('FFFCEBC7') }
const THIN = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }

export async function exportQaReportXlsx(report: QaReport, title: string): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SA Copilot'
  const t = reportTotals(report)

  const summary = wb.addWorksheet('Summary')
  summary.columns = [{ width: 22 }, { width: 110 }]
  const rows: [string, string | number][] = [
    ['QA Report', title],
    ['Livechat', report.livechatUrl],
    ['Started', when(report.startedAt)],
    ['Finished', when(report.finishedAt)],
    ['Steps', t.steps],
    ['Pass', t.pass],
    ['Fail / no reply', t.fail],
    ['Actions to check', t.actionsPending],
    ['Actions passed', t.actionsPass],
    ['Actions failed', t.actionsFail],
    ['Summary', report.summary],
    ['Revision prompt', revisionInstruction(report)],
  ]
  for (const r of rows) summary.addRow(r)
  summary.eachRow((row) => {
    row.getCell(1).font = { bold: true }
    row.eachCell((c) => (c.alignment = { vertical: 'top', wrapText: true }))
  })

  const ws = wb.addWorksheet('Results', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Case', width: 28 },
    { header: 'Goal', width: 28 },
    { header: 'Step', width: 6 },
    { header: 'Customer', width: 40 },
    { header: 'Agent reply', width: 55 },
    { header: 'Expected reply', width: 45 },
    { header: 'Verdict', width: 11 },
    { header: 'Why', width: 45 },
    { header: 'Expected action', width: 28 },
    { header: 'Action check', width: 16 },
    { header: 'Case error', width: 28 },
  ]
  for (const c of report.cases) {
    for (const [j, s] of c.steps.entries()) {
      const row = ws.addRow([c.title, c.goal, j + 1, s.sent, s.replies.join('\n'), s.expectedAi, VERDICT_LABEL[s.verdict], s.reason, s.expectedAction, ACTION_LABEL[s.actionCheck], c.error])
      row.getCell(7).fill = VERDICT_FILL[s.verdict]
    }
  }
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = HEADER_FILL
  })
  ws.eachRow((row) =>
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: THIN, left: THIN, bottom: THIN, right: THIN }
      c.alignment = { vertical: 'top', wrapText: true }
    }),
  )
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
