import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { QaReport } from '../pocQa.ts'
import { exportQaReportDocx, exportQaReportXlsx, qaReportMarkdown } from './qaReport.ts'

const report: QaReport = {
  livechatUrl: 'https://live.cekat.ai/?chat=x',
  startedAt: '2026-10-02T03:00:00.000Z',
  finishedAt: '2026-10-02T03:05:00.000Z',
  summary: 'Agent menjawab **biaya** dengan benar.',
  revisionPrompt: 'Tambahkan aturan pelunasan.',
  cases: [
    {
      title: 'Biaya haji',
      goal: 'Tahu biaya',
      error: '',
      steps: [
        { sent: 'Berapa biaya?', replies: ['Rp 50 juta', 'Ada lagi?'], expectedAi: 'Rp 50 juta', expectedAction: '', verdict: 'pass', reason: 'Sesuai', actionCheck: 'none' },
        { sent: 'A | B?', replies: [], expectedAi: 'Jelaskan', expectedAction: 'Label: Info', verdict: 'no_reply', reason: 'Timeout', actionCheck: 'pending' },
      ],
    },
  ],
}

describe('qaReportMarkdown', () => {
  it('has the totals, every step in a table and the revision prompt, with pipes escaped', () => {
    const md = qaReportMarkdown(report, 'BPKH')
    expect(md).toContain('# QA Report — BPKH')
    expect(md).toContain('| Steps | Pass | Fail |')
    expect(md).toContain('A \\| B?')
    expect(md).toContain('Rp 50 juta<br>Ada lagi?')
    expect(md).toContain('Tambahkan aturan pelunasan.')
    expect(md).toContain('Label: Info')
  })
})

describe('exportQaReportXlsx', () => {
  it('writes a Summary sheet and one Results row per step with the verdict', async () => {
    const blob = await exportQaReportXlsx(report, 'BPKH')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    const results = wb.getWorksheet('Results')!
    expect(results.getRow(1).getCell(1).value).toBe('Case')
    expect(results.rowCount).toBe(3)
    expect(results.getRow(2).getCell(5).value).toBe('Rp 50 juta\nAda lagi?')
    expect(results.getRow(3).getCell(7).value).toBe('No reply')
    expect(results.getRow(3).getCell(10).value).toBe('Not checked')
    const summary = wb.getWorksheet('Summary')!
    expect(JSON.stringify(summary.getSheetValues())).toContain('Tambahkan aturan pelunasan.')
  })
})

describe('exportQaReportDocx', () => {
  it('produces a Word document', async () => {
    const blob = await exportQaReportDocx(report, 'BPKH')
    expect(blob.size).toBeGreaterThan(1000)
  })
})
