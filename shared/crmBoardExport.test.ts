import { describe, expect, it } from 'vitest'
import { boardDrawioXml, boardSvg, hslToHex, layoutBoard } from './crmBoardExport.ts'
import { drawioCreatePayload } from './drawio.ts'
import { boardFromAi } from './pocCrm.ts'

const board = boardFromAi({
  name: 'Leads <KPR>',
  description: '',
  columns: [
    { name: 'Lead', type: 'text', options: [] },
    { name: 'Status', type: 'select', options: [{ label: 'New Lead', condition: '' }, { label: 'Qualified', condition: 'Sudah isi data' }] },
    { name: 'Nomor Telepon', type: 'phone', options: [] },
  ],
  kanbanColumn: 'Status',
  rows: [{ values: ['David Raditya', 'New Lead', '62818840899'] }, { values: ['Ridhwan & Co', 'Qualified', ''] }],
})

describe('layoutBoard', () => {
  it('lays the table out as title + header row + one row per item', () => {
    const { shapes } = layoutBoard(board, 'table')
    // title, index header, 3 column headers, 2 rows × (index + 3 cells)
    expect(shapes).toHaveLength(1 + 1 + 3 + 2 * 4)
    expect(shapes.some((s) => s.text === 'Status · Select')).toBe(true)
  })

  it('lays the kanban out as one lane per option with its cards', () => {
    const texts = layoutBoard(board, 'kanban').shapes.map((s) => s.text)
    expect(texts).toContain('New Lead (1)')
    expect(texts).toContain('Qualified (1)')
    expect(texts).toContain('Sudah isi data')
    expect(texts).toContain('David Raditya\nNomor Telepon: 62818840899')
  })
})

describe('boardSvg / boardDrawioXml', () => {
  it('produces well-formed, escaped SVG', () => {
    const svg = boardSvg(board, 'table')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('Leads &lt;KPR&gt;')
    expect(svg).toContain('Ridhwan &amp; Co')
    expect(svg).not.toContain('<KPR>')
  })

  it('produces draw.io XML with one editable vertex per shape', () => {
    const drawio = boardDrawioXml(board, 'kanban')
    expect(drawio.startsWith('<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>')).toBe(true)
    expect(drawio.match(/vertex="1"/g)?.length).toBe(layoutBoard(board, 'kanban').shapes.length)
    expect(drawio).toContain('David Raditya&lt;br&gt;Nomor Telepon: 62818840899')
  })

  it('can be sent to draw.io as an xml create payload', async () => {
    expect(await drawioCreatePayload(boardDrawioXml(board, 'table'), 'xml')).toMatchObject({ type: 'xml', compressed: true })
  })
})

describe('hslToHex', () => {
  it('converts primary hues', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000')
    expect(hslToHex(120, 100, 50)).toBe('#00ff00')
  })
})
