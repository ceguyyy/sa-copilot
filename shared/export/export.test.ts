import ExcelJS from 'exceljs'
import { describe, expect, test } from 'vitest'
import type { TimelineContent, UserJourneyContent } from '../schemas.ts'
import { exportDocx } from './docx.ts'
import { exportXlsx, journeySheetName } from './xlsx.ts'

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

  test('writes the user journey as READ_ME + one sheet per topic with blue section rows', async () => {
    const journey: UserJourneyContent = {
      title: 'User Journey',
      persona: 'Clara',
      sheets: [
        {
          name: 'Greeting, Main Menu',
          sections: [
            { title: 'Greeting', scripts: [{ no: '1', parent: 'root', scenario: 'Greeting', trigger: 'halo', response: 'Hai 👋', note: '', revision: 'added 28/09/2026' }] },
            { title: 'Main Menu', scripts: [{ no: '2', parent: 'random', scenario: 'Main menu', trigger: 'menu', response: '[button] Booking', note: '', revision: '' }] },
          ],
        },
        { name: 'Tracking/Paket: [cek]', sections: [{ title: '', scripts: [{ no: '1', parent: 'random', scenario: 'Cek', trigger: '[no resi]', response: 'Status: [Status]', note: 'API GET', revision: '' }] }] },
      ],
    }
    const wb = await readBack(await exportXlsx('user_journey', 'User Journey', journey))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['READ_ME!', 'Greeting, Main Menu', 'Tracking Paket cek'])
    const ws = wb.getWorksheet('Greeting, Main Menu')!
    expect(ws.getRow(1).values).toEqual([undefined, 'Script No', 'Parent', 'Scenario', 'Trigger / Condition', 'Ekspektasi Respon', 'Note', 'Revision History'])
    expect(ws.getRow(2).getCell(1).value).toBe('Greeting')
    expect((ws.getRow(2).getCell(1).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFA4C2F4')
    expect(ws.getRow(3).getCell(4).value).toBe('halo')
    expect(ws.getRow(4).getCell(1).value).toBe('Main Menu')
  })

  test('keeps sheet names within Excel limits and unique', () => {
    const used = new Set<string>()
    expect(journeySheetName('A'.repeat(40), used)).toHaveLength(31)
    expect(journeySheetName('A'.repeat(40), used)).toBe(`${'A'.repeat(29)} 2`)
    expect(journeySheetName('', used)).toBe('Topic')
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
