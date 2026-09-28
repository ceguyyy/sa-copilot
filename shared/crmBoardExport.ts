// Renders a POC CRM board (table or kanban view) as a standalone SVG or as draw.io XML. Both come from one layout,
// so the SVG download and the editable draw.io diagram always look the same.
import { CRM_COLUMN_LABELS, hasOptions, kanbanLanes, type CrmBoard } from './pocCrm.ts'

export type BoardView = 'table' | 'kanban'

export interface Shape {
  x: number
  y: number
  w: number
  h: number
  text: string
  fill: string
  stroke: string
  color: string
  fontSize: number
  bold?: boolean
  align?: 'left' | 'center'
  rounded?: boolean
}

export interface BoardLayout {
  width: number
  height: number
  shapes: Shape[]
}

const INK = '#1f2a24'
const MUTED = '#6b6f68'
const LINE = '#d9d4c7'
const PANEL = '#ffffff'
const SOFT = '#f4f1ea'
const OPTION_HUES = [32, 205, 145, 280, 350, 55, 180, 15]
const PAD = 16
const TITLE_H = 36

/** hsl → #rrggbb (draw.io styles take hex colors). */
export function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

const optionFill = (index: number) => hslToHex(OPTION_HUES[index % OPTION_HUES.length], 90, 84)

const title = (board: CrmBoard, width: number): Shape => ({
  x: PAD,
  y: PAD,
  w: width - PAD * 2,
  h: TITLE_H - 8,
  text: board.name || 'Untitled board',
  fill: 'none',
  stroke: 'none',
  color: INK,
  fontSize: 18,
  bold: true,
  align: 'left',
})

function tableLayout(board: CrmBoard): BoardLayout {
  const indexW = 40
  const colW = 170
  const headerH = 40
  const rowH = 36
  const top = PAD + TITLE_H
  const width = PAD * 2 + indexW + Math.max(1, board.columns.length) * colW
  const cell = (x: number, y: number, w: number, h: number, text: string, extra: Partial<Shape> = {}): Shape => ({
    x, y, w, h, text, fill: PANEL, stroke: LINE, color: INK, fontSize: 12, align: 'center', ...extra,
  })
  const shapes: Shape[] = [title(board, width), cell(PAD, top, indexW, headerH, '', { fill: SOFT })]
  board.columns.forEach((c, i) => {
    shapes.push(cell(PAD + indexW + i * colW, top, colW, headerH, `${c.name || 'Untitled'} · ${CRM_COLUMN_LABELS[c.type]}`, { fill: SOFT, bold: true }))
  })
  board.rows.forEach((row, r) => {
    const y = top + headerH + r * rowH
    shapes.push(cell(PAD, y, indexW, rowH, String(r + 1), { color: MUTED, fontSize: 11 }))
    board.columns.forEach((c, i) => {
      const value = row[c.key] ?? ''
      const optionIndex = hasOptions(c.type) ? c.options.findIndex((o) => o.label && o.label === value) : -1
      const text = c.type === 'checkbox' ? (value === 'true' ? '✓' : '') : value
      shapes.push(cell(PAD + indexW + i * colW, y, colW, rowH, text, optionIndex >= 0 ? { fill: optionFill(optionIndex) } : {}))
    })
  })
  const height = top + headerH + board.rows.length * rowH + PAD
  return { width, height, shapes }
}

function kanbanLayout(board: CrmBoard): BoardLayout {
  const laneW = 230
  const gap = 16
  const cardGap = 8
  const lineH = 18
  const top = PAD + TITLE_H
  const lanes = kanbanLanes(board)
  const options = board.columns.find((c) => c.key === board.kanbanColumn)?.options ?? []
  const [titleColumn, ...rest] = board.columns.filter((c) => c.key !== board.kanbanColumn)
  const width = PAD * 2 + Math.max(1, lanes.length) * laneW + Math.max(0, lanes.length - 1) * gap
  const shapes: Shape[] = [title(board, width)]
  const laneShapes: Shape[] = []
  let laneBottom = top + 80

  lanes.forEach((lane, l) => {
    const x = PAD + l * (laneW + gap)
    const optionIndex = options.findIndex((o) => o.label === lane.label)
    shapes.push({ x: x + 8, y: top + 8, w: laneW - 16, h: 26, text: `${lane.label || 'Untitled'} (${lane.rowIndexes.length})`, fill: optionIndex >= 0 ? optionFill(optionIndex) : PANEL, stroke: 'none', color: INK, fontSize: 12, bold: true, rounded: true })
    let y = top + 42
    if (lane.condition) {
      shapes.push({ x: x + 8, y, w: laneW - 16, h: 30, text: lane.condition, fill: 'none', stroke: 'none', color: MUTED, fontSize: 10, align: 'left' })
      y += 34
    }
    for (const r of lane.rowIndexes) {
      const row = board.rows[r]
      const details = rest.filter((c) => row[c.key]).slice(0, 3)
      const lines = [(titleColumn && row[titleColumn.key]) || 'Untitled item', ...details.map((c) => `${c.name}: ${row[c.key]}`)]
      const h = 12 + lines.length * lineH
      shapes.push({ x: x + 8, y, w: laneW - 16, h, text: lines.join('\n'), fill: PANEL, stroke: LINE, color: INK, fontSize: 11, align: 'left', rounded: true })
      y += h + cardGap
    }
    laneBottom = Math.max(laneBottom, y + 8)
    laneShapes.push({ x, y: top, w: laneW, h: 0, text: '', fill: SOFT, stroke: 'none', color: INK, fontSize: 12, rounded: true })
  })
  // Lanes sit behind their content and share the height of the tallest one.
  const lanesBack = laneShapes.map((s) => ({ ...s, h: laneBottom - top }))
  return { width, height: laneBottom + PAD, shapes: [shapes[0], ...lanesBack, ...shapes.slice(1)] }
}

export function layoutBoard(board: CrmBoard, view: BoardView): BoardLayout {
  return view === 'kanban' ? kanbanLayout(board) : tableLayout(board)
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Cuts a line to roughly what fits in `width` px at `fontSize`. */
function fit(line: string, width: number, fontSize: number): string {
  const max = Math.max(3, Math.floor((width - 12) / (fontSize * 0.56)))
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export function boardSvg(board: CrmBoard, view: BoardView): string {
  const { width, height, shapes } = layoutBoard(board, view)
  const body = shapes.map((s) => {
    const rect = s.fill === 'none' && s.stroke === 'none' ? '' : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rounded ? 6 : 0}" fill="${s.fill}" stroke="${s.stroke}"/>`
    const lines = s.text.split('\n')
    const anchor = s.align === 'left' ? 'start' : 'middle'
    const tx = s.align === 'left' ? s.x + 8 : s.x + s.w / 2
    const lineH = s.fontSize * 1.5
    const firstY = s.y + s.h / 2 - ((lines.length - 1) * lineH) / 2
    const text = s.text
      ? `<text x="${tx}" text-anchor="${anchor}" font-size="${s.fontSize}" fill="${s.color}"${s.bold ? ' font-weight="600"' : ''}>${lines
          .map((line, i) => `<tspan x="${tx}" y="${firstY + i * lineH}" dominant-baseline="middle"${i > 0 ? ' fill="' + MUTED + '"' : ''}>${xml(fit(line, s.w, s.fontSize))}</tspan>`)
          .join('')}</text>`
      : ''
    return rect + text
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, Segoe UI, Arial, sans-serif"><rect width="100%" height="100%" fill="${PANEL}"/>${body.join('')}</svg>`
}

/** draw.io (mxGraph) XML of the board: every cell/card is an editable shape. */
export function boardDrawioXml(board: CrmBoard, view: BoardView): string {
  const { shapes } = layoutBoard(board, view)
  const cells = shapes.map((s, i) => {
    const style = [
      s.rounded ? 'rounded=1;arcSize=12' : 'rounded=0',
      'whiteSpace=wrap',
      'html=1',
      `fillColor=${s.fill}`,
      `strokeColor=${s.stroke}`,
      `fontColor=${s.color}`,
      `fontSize=${s.fontSize}`,
      s.bold ? 'fontStyle=1' : '',
      `align=${s.align ?? 'center'}`,
      s.align === 'left' ? 'spacingLeft=8' : '',
      'verticalAlign=middle',
    ]
      .filter(Boolean)
      .join(';')
    const value = xml(s.text).replace(/\n/g, '&lt;br&gt;')
    return `<mxCell id="s${i}" value="${value}" style="${style};" vertex="1" parent="1"><mxGeometry x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" as="geometry"/></mxCell>`
  })
  return `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel>`
}
