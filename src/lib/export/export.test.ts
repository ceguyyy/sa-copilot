import ExcelJS from 'exceljs'
import { describe, expect, test } from 'vitest'
import type { TimelineContent } from '../../../supabase/functions/_shared/schemas.ts'
import { exportDocx } from './docx'
import { exportXlsx } from './xlsx'

const timeline: TimelineContent = {
  title: 'Timeline Setup',
  start_date: '2026-10-05',
  rows: [
    { no: '1', activity: 'Kickoff', module: '', function: '', pic: 'Cekat', days: 1, parallel: false },
    { no: '2', activity: 'AI Setting', module: 'Train', function: 'Train AI', pic: 'Cekat', days: 6, parallel: false },
  ],
  notes: ['*Masking disclaimer'],
}

async function readBack(blob: Blob) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await blob.arrayBuffer())
  return wb
}

describe('exportXlsx', () => {
  test('writes TOR with the template header row', async () => {
    const blob = await exportXlsx('tor', 'TOR', {
      rows: [{ layanan: 'Business', sub_layanan: '7 Human Agents', deskripsi: 'Seat', note: '', raised_by: '' }],
    })
    const ws = (await readBack(blob)).getWorksheet('Default TOR')!
    expect(ws.getRow(1).values).toEqual([undefined, 'Layanan', 'Sub Layanan', 'Deskripsi', 'Note', 'Raised By'])
    expect(ws.getRow(2).getCell(2).value).toBe('7 Human Agents')
  })

  test('writes the timeline with mandays total and week bars', async () => {
    const ws = (await readBack(await exportXlsx('timeline', 'Timeline', timeline))).getWorksheet('TIMELINE')!
    expect(ws.getRow(3).getCell(7).value).toBe('Weeks (7 Mandays)')
    // row 6 = "AI Setting", days 1..7 => weeks 1 and 2 are filled
    const fill = (col: number) => (ws.getRow(6).getCell(col).fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb
    expect(fill(7)).toBe('FFE0673A')
    expect(fill(8)).toBe('FFE0673A')
  })

  test('refuses types without a spreadsheet layout', async () => {
    await expect(exportXlsx('sow_cekat', 'SOW', { meta: [], sections: [] })).rejects.toThrow(/not available/)
  })
})

describe('exportDocx', () => {
  test('produces a non-empty .docx (zip) for a SOW', async () => {
    const blob = await exportDocx('sow_cekat', 'SOW', {
      meta: [{ key: 'Client Name', value: 'ACME' }],
      sections: [{ title: 'Out of Scope', markdown: '- **Meta** approval\n\n| A | B |\n|---|---|\n| 1 | 2 |' }],
    })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(1000)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
  })
})
