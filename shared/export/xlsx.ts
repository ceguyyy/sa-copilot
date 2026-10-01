import type {
  AssessmentContent,
  DocType,
  TimelineContent,
  TorContent,
  UserJourneyContent,
} from '../schemas.ts'
import { computeSchedule, weeksCovered } from '../timeline.ts'

type Workbook = import('exceljs').Workbook
type Worksheet = import('exceljs').Worksheet

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F3B34' } }
const BAR_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE0673A' } }
const THIN = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }

export const XLSX_TYPES: DocType[] = ['assessment', 'tor', 'timeline', 'user_journey']

export async function exportXlsx(type: DocType, title: string, content: unknown): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SA Copilot'
  if (type === 'assessment') assessmentSheet(wb, content as AssessmentContent)
  else if (type === 'tor') torSheet(wb, content as TorContent)
  else if (type === 'timeline') timelineSheet(wb, title, content as TimelineContent)
  else if (type === 'user_journey') userJourneySheets(wb, content as UserJourneyContent)
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
  ws.addRow([...fixed, `Weeks (${s.totalMandays} Mandays)`])
  ws.addRow([...fixed.map(() => ''), ...Array.from({ length: weeks }, (_, i) => i + 1)])
  ws.mergeCells(3, fixed.length + 1, 3, fixed.length + weeks)
  fixed.forEach((_, i) => ws.mergeCells(3, i + 1, 4, i + 1))
  styleHeader(ws, 3)
  styleHeader(ws, 4)

  for (const r of s.rows) {
    const row = ws.addRow([r.no, r.activity, r.module, r.function, r.pic, r.days])
    for (const w of weeksCovered(r.startDay, r.endDay)) row.getCell(fixed.length + w).fill = BAR_FILL
  }
  for (const [label, value] of [
    ['Total Mandays', s.totalMandays],
    ['IT Delivery Mandays (AI Setting + Integration & APIs)', s.itDeliveryMandays],
  ] as const) {
    const total = ws.addRow(['', label, '', '', '', value])
    total.font = { bold: true }
    ws.mergeCells(total.number, 2, total.number, 5)
  }
  ws.columns.forEach((col, i) => (col.width = [5, 28, 26, 44, 16, 10][i] ?? 5))
  borderAll(ws, 3)

  if (c.notes.length) {
    ws.addRow([])
    ws.addRow(['', `Keterangan:\n${c.notes.map((n) => `- ${n}`).join('\n')}`])
  }
}

// ---------- User Journey (Cekat "Template User Journey Workflows") ----------

const JOURNEY_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFA4C2F4' } }
const JOURNEY_HEADERS = ['Script No', 'Parent', 'Scenario', 'Trigger / Condition', 'Ekspektasi Respon', 'Note', 'Revision History']
const JOURNEY_WIDTHS = [10, 10, 24, 28, 60, 28, 18]

export const JOURNEY_GUIDE: [string, string, string][] = [
  [
    '1',
    'Rencanakan flow AI Agent Anda, buat dalam bentuk diagram\n - Tentukan topik AI Agent\n - Apakah ada integrasi API ke sistem Anda atau 3rd party\n - Terhubung dengan agent\n - Survey satisfaction\n dsb',
    'Sample Flow Diagram',
  ],
  [
    '2',
    'Ubah flow diagram yang sudah dibuat ke dalam user journey\n\nTips\n - Berikan nama persona AI Agent & greeting dengan nama user\n - Berikan emoticon untuk percakapan yang lebih interaktif dan menarik\n - Berikan idle respon/followup ketika user dalam 5 menit tidak mengirimkan pesan di beberapa kondisi yang diinginkan\n - Validasi untuk inputan seperti nomor telepon, email, dan item lain dengan data sensitif seperti nomor tagihan, id dll\n - Berikan respon ketika kondisi error API jika terdapat hit API',
    'User journey berisi redaksional dan konten AI Agent yang akan ditampilkan. Masing-masing topik yang sifatnya flowbased / menu dapat dibuat di sheet yang berbeda.\n\nDefault header user journey:\n1. Script No — nomor script\n2. Parent — turunan dari script lain: nomor script, random (bisa diakses di state mana saja), root (awal sesi)\n3. Scenario — nama skenario/activity\n4. Trigger / Condition — sample input user atau kondisi yang dibaca sistem\n5. Ekspektasi Respon — respon AI Agent; data dinamis dari API ditulis [variabel], mis. [name user]\n6. Note — terhubung API (GET/POST), pengecekan status, validasi, set label, routing teams, dll',
  ],
  ['3', 'Tambahkan sheet topik terpisah untuk konten knowledge seperti FAQ, Produk, Promo, atau Lokasi Cabang (jika tidak terhubung dengan API atau sebagai freetext)', 'Sesuaikan dengan format yang tersedia'],
  ['4', 'Konsultasikan flow AI Agent Anda dengan Tim Cekat', 'Setelah flow AI Agent selesai diisi, tim konsultan Cekat akan mereview dan memproses kebutuhan Anda.'],
]

/** Excel sheet names: max 31 chars, no []:*?/\ and unique within the workbook. */
export function journeySheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Topic').slice(0, 31)
  let candidate = base
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`
  used.add(candidate.toLowerCase())
  return candidate
}

function userJourneySheets(wb: Workbook, c: UserJourneyContent) {
  const used = new Set<string>(['read_me!'])
  const guide = wb.addWorksheet('READ_ME!')
  guide.columns = [{ width: 4 }, { width: 6 }, { width: 70 }, { width: 70 }]
  guide.addRow(['', c.title || 'GUIDE MEMBUAT USER JOURNEY AI AGENT WORKFLOW']).font = { bold: true, size: 14 }
  const head = guide.addRow(['', 'No', 'Step', 'Keterangan'])
  head.eachCell((cell, col) => {
    if (col === 1) return
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB7B7B7' } }
  })
  for (const [no, step, note] of JOURNEY_GUIDE) guide.addRow(['', no, step, note])
  guide.eachRow((row, n) => {
    if (n < 2) return
    row.eachCell((cell, col) => {
      if (col === 1) return
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN }
      cell.alignment = { vertical: 'top', wrapText: true }
    })
  })

  for (const sheet of c.sheets) {
    const ws = wb.addWorksheet(journeySheetName(sheet.name, used))
    ws.columns = JOURNEY_WIDTHS.map((width) => ({ width }))
    const header = ws.addRow(JOURNEY_HEADERS)
    header.eachCell((cell) => {
      cell.font = { bold: true }
      cell.fill = JOURNEY_FILL
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    })
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const section of sheet.sections) {
      if (section.title.trim()) {
        const row = ws.addRow([section.title])
        ws.mergeCells(row.number, 1, row.number, JOURNEY_HEADERS.length)
        row.getCell(1).font = { bold: true }
        row.getCell(1).fill = JOURNEY_FILL
      }
      for (const s of section.scripts) ws.addRow([s.no, s.parent, s.scenario, s.trigger, s.response, s.note, s.revision])
    }
    borderAll(ws, 1)
  }
}
