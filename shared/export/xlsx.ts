import type {
  AssessmentContent,
  DocType,
  TimelineContent,
  TorContent,
} from '../schemas.ts'
import { computeSchedule, weeksCovered } from '../timeline.ts'

type Workbook = import('exceljs').Workbook
type Worksheet = import('exceljs').Worksheet

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F3B34' } }
const BAR_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE0673A' } }
const THIN = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }

export const XLSX_TYPES: DocType[] = ['assessment', 'tor', 'timeline']

export async function exportXlsx(type: DocType, title: string, content: unknown): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SA Copilot'
  if (type === 'assessment') assessmentSheet(wb, content as AssessmentContent)
  else if (type === 'tor') torSheet(wb, content as TorContent)
  else if (type === 'timeline') timelineSheet(wb, title, content as TimelineContent)
  else throw new Error(`XLSX export is not available for ${type}`)
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function styleHeader(ws: Worksheet, rowNo: number) {
  ws.getRow(rowNo).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = HEADER_FILL
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
}

function borderAll(ws: Worksheet, fromRow: number) {
  ws.eachRow((row, n) => {
    if (n < fromRow) return
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: THIN, left: THIN, bottom: THIN, right: THIN }
      c.alignment = { ...c.alignment, vertical: 'top', wrapText: true }
    })
  })
}

function assessmentSheet(wb: Workbook, c: AssessmentContent) {
  const ws = wb.addWorksheet(c.language === 'en' ? 'CEKAT - EN' : 'CEKAT - ID')
  ws.columns = [{ width: 6 }, { width: 70 }, { width: 70 }, { width: 18 }]
  ws.addRow(['No', c.language === 'en' ? 'Business Process Requirement Assessment' : 'Assesment Kebutuhan Proses Bisnis', 'Feedback', 'Status'])
  styleHeader(ws, 1)
  for (const r of c.rows) ws.addRow([r.no, r.question, r.feedback, r.status])
  borderAll(ws, 1)
}

function torSheet(wb: Workbook, c: TorContent) {
  const ws = wb.addWorksheet('Default TOR')
  ws.columns = [{ width: 22 }, { width: 34 }, { width: 70 }, { width: 30 }, { width: 14 }]
  ws.addRow(['Layanan', 'Sub Layanan', 'Deskripsi', 'Note', 'Raised By'])
  styleHeader(ws, 1)
  for (const r of c.rows) {
    const row = ws.addRow([r.layanan, r.sub_layanan, r.deskripsi, r.note, r.raised_by])
    if (r.layanan && !r.sub_layanan) row.font = { bold: true }
  }
  borderAll(ws, 1)
}

function timelineSheet(wb: Workbook, title: string, c: TimelineContent) {
  const ws = wb.addWorksheet('TIMELINE')
  const s = computeSchedule(c.rows, c.start_date || undefined)
  const weeks = Math.max(s.totalWeeks, 1)
  const fixed = ['No', 'Activity', 'Module', 'Function', 'PIC', 'SLA/Days']

  ws.addRow([c.title || title])
  ws.getRow(1).font = { bold: true, size: 14 }
  ws.addRow([])
  ws.addRow([...fixed, `Weeks (${s.totalDays} Mandays)`])
  ws.addRow([...fixed.map(() => ''), ...Array.from({ length: weeks }, (_, i) => i + 1)])
  ws.mergeCells(3, fixed.length + 1, 3, fixed.length + weeks)
  fixed.forEach((_, i) => ws.mergeCells(3, i + 1, 4, i + 1))
  styleHeader(ws, 3)
  styleHeader(ws, 4)

  for (const r of s.rows) {
    const row = ws.addRow([r.no, r.activity, r.module, r.function, r.pic, r.days])
    for (const w of weeksCovered(r.startDay, r.endDay)) row.getCell(fixed.length + w).fill = BAR_FILL
  }
  ws.columns.forEach((col, i) => (col.width = [5, 28, 26, 44, 16, 10][i] ?? 5))
  borderAll(ws, 3)

  if (c.notes.length) {
    ws.addRow([])
    ws.addRow(['', `Keterangan:\n${c.notes.map((n) => `- ${n}`).join('\n')}`])
  }
}
