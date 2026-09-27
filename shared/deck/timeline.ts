// Slide 40 — Gantt of the project's Timeline document: prerequisites, week/day grid, bars coloured by
// phase (the Timeline's "module" column), phase summary boxes and the timeline note. ≈1.63 : 1
import type { TimelineContent } from '../schemas.ts'
import { WORKING_DAYS_PER_WEEK, computeSchedule } from '../timeline.ts'
import { C, CYCLE, circle, rect, svgDoc, text, tint } from './svg.ts'
import type { DeckContent } from './types.ts'

const MAX_DAY_COLUMNS = 40
const MAX_PHASES = 5

export function timelineSvg(timeline: TimelineContent, notes: DeckContent['timeline']): string {
  const W = 1630
  const H = 1000
  const pad = 16
  const schedule = computeSchedule(timeline.rows, timeline.start_date || undefined)
  const rows = schedule.rows.filter((r) => r.endDay > r.startDay)
  const totalDays = Math.max(schedule.totalDays, 1)
  const weeks = Math.max(Math.ceil(totalDays / WORKING_DAYS_PER_WEEK), 1)

  // Phases = distinct modules in order of appearance.
  const phaseNames: string[] = []
  for (const r of rows) {
    const name = r.module?.trim() || 'Project'
    if (!phaseNames.includes(name)) phaseNames.push(name)
  }
  const phaseColor = (name: string) => CYCLE[Math.max(phaseNames.indexOf(name?.trim() || 'Project'), 0) % CYCLE.length]

  let body = ''
  // ---- prerequisites strip
  const topH = 108
  body += rect(pad, pad, W - pad * 2, topH, { fill: C.white, stroke: C.line, r: 14, sw: 2 })
  body += text(pad + 24, pad + 40, 'TIMELINE DIMULAI SETELAH:', { size: 20, weight: 800, color: C.navy, width: 360 }).svg
  body += text(pad + 24, pad + 68, 'SOW ditandatangani & seluruh prasyarat diterima', { size: 16, color: C.ink, width: 360, maxLines: 2, lineHeight: 19 }).svg
  body += `<line x1="${pad + 400}" y1="${pad + 16}" x2="${pad + 400}" y2="${pad + topH - 16}" stroke="${C.line}" stroke-width="2"/>`
  body += text(pad + 424, pad + 38, 'PRASYARAT YANG DITERIMA:', { size: 18, weight: 800, color: C.navy, width: 400 }).svg
  const pre = notes.prerequisites.slice(0, 6)
  const pw = (W - pad * 2 - 440) / Math.max(pre.length, 1)
  pre.forEach((p, i) => {
    const x = pad + 424 + i * pw
    body += rect(x, pad + 54, 30, 36, { fill: tint(C.blue, 0.12), stroke: C.blue, r: 6, sw: 2 })
    body += text(x + 40, pad + 70, p, { size: 15, color: C.ink, width: pw - 48, maxLines: 2, lineHeight: 18 }).svg
  })

  // ---- gantt grid
  const gy = pad + topH + 16
  const labelW = 360
  const gridX = pad + labelW
  const gridW = W - pad * 2 - labelW
  const showDays = totalDays <= MAX_DAY_COLUMNS
  const headH = showDays ? 72 : 48
  const phaseH = 186
  const noteH = 74
  const rowsH = H - gy - headH - phaseH - noteH - pad * 3 - 4
  const rowH = Math.min(40, rowsH / Math.max(rows.length, 1))
  const dayW = gridW / totalDays

  body += rect(pad, gy, labelW, headH, { fill: C.navy, r: 10 }) + rect(pad + labelW - 10, gy, 10, headH, { fill: C.navy })
  body += text(pad, gy + headH / 2 + 8, 'AKTIVITAS', { size: 20, weight: 800, color: C.white, width: labelW, anchor: 'middle' }).svg
  for (let w = 0; w < weeks; w++) {
    const x = gridX + w * WORKING_DAYS_PER_WEEK * dayW
    const width = Math.min(WORKING_DAYS_PER_WEEK, totalDays - w * WORKING_DAYS_PER_WEEK) * dayW
    body += rect(x, gy, width, showDays ? 46 : headH, { fill: C.blue, stroke: C.white, sw: 1 })
    body += text(x, gy + 22, `WEEK ${w + 1}`, { size: Math.min(17, width / 5), weight: 800, color: C.white, width, anchor: 'middle', maxLines: 1 }).svg
    const first = w * WORKING_DAYS_PER_WEEK + 1
    body += text(x, gy + 40, `(Day ${first} - ${Math.min(first + WORKING_DAYS_PER_WEEK - 1, totalDays)})`, { size: Math.min(13, width / 7), color: tint(C.white, 0.85), width, anchor: 'middle', maxLines: 1 }).svg
  }
  if (showDays) {
    for (let d = 0; d < totalDays; d++) {
      body += rect(gridX + d * dayW, gy + 46, dayW, 26, { fill: C.bg, stroke: C.line, sw: 1 })
      body += text(gridX + d * dayW, gy + 64, String(d + 1), { size: Math.min(14, dayW * 0.55), color: C.ink, width: dayW, anchor: 'middle' }).svg
    }
  }
  const ry = gy + headH
  for (let w = 1; w < weeks; w++) {
    const x = gridX + w * WORKING_DAYS_PER_WEEK * dayW
    body += `<line x1="${x}" y1="${ry}" x2="${x}" y2="${ry + rows.length * rowH}" stroke="${C.line}" stroke-width="1.5" stroke-dasharray="6 6"/>`
  }
  rows.forEach((r, i) => {
    const y = ry + i * rowH
    if (i % 2 === 0) body += rect(pad, y, W - pad * 2, rowH, { fill: tint(C.bg, 0.6) })
    body += text(pad + 16, y + rowH / 2 + 6, r.activity, { size: Math.min(17, rowH * 0.46), weight: 600, color: C.ink, width: labelW - 30, maxLines: 1 }).svg
    const color = phaseColor(r.module)
    const x1 = gridX + r.startDay * dayW + Math.min(8, dayW / 3)
    const x2 = gridX + r.endDay * dayW - Math.min(8, dayW / 3)
    const cy = y + rowH / 2
    body += `<line x1="${x1}" y1="${cy}" x2="${Math.max(x2, x1 + 2)}" y2="${cy}" stroke="${color}" stroke-width="${Math.max(3, rowH * 0.14)}" stroke-linecap="round"/>`
    body += circle(x1, cy, Math.max(4, rowH * 0.17), color) + circle(Math.max(x2, x1 + 2), cy, Math.max(4, rowH * 0.17), color)
  })

  // ---- phase boxes
  const py = ry + rows.length * rowH + pad
  const phases = phaseNames.slice(0, MAX_PHASES)
  const bw = (W - pad * 2 - 16 * (phases.length - 1)) / Math.max(phases.length, 1)
  phases.forEach((name, i) => {
    const x = pad + i * (bw + 16)
    const color = CYCLE[i % CYCLE.length]
    const inPhase = rows.filter((r) => (r.module?.trim() || 'Project') === name)
    const start = Math.min(...inPhase.map((r) => r.startDay)) + 1
    const end = Math.max(...inPhase.map((r) => r.endDay))
    body += rect(x, py, bw, phaseH, { fill: C.white, stroke: tint(color, 0.5), r: 12, sw: 2 })
    body += rect(x, py, bw, 62, { fill: tint(color, 0.1), r: 12 })
    body += text(x, py + 24, `PHASE ${i + 1}`, { size: 15, weight: 800, color, width: bw, anchor: 'middle' }).svg
    body += text(x + 10, py + 44, name.toUpperCase(), { size: 16, weight: 800, color, width: bw - 20, anchor: 'middle', maxLines: 1 }).svg
    body += text(x, py + 58, `(Day ${start} - ${end})`, { size: 13, color: C.muted, width: bw, anchor: 'middle' }).svg
    inPhase.slice(0, 5).forEach((r, j) => {
      body += circle(x + 20, py + 84 + j * 22, 3, C.ink)
      body += text(x + 30, py + 89 + j * 22, r.activity, { size: 14, color: C.ink, width: bw - 44, maxLines: 1 }).svg
    })
  })

  // ---- note + legend
  const ny = H - pad - noteH
  body += rect(pad, ny, W - pad * 2, noteH, { fill: tint(C.blue, 0.05), stroke: C.line, r: 12, sw: 2 })
  body += text(pad + 20, ny + 26, 'CATATAN PENTING', { size: 15, weight: 800, color: C.navy, width: 300 }).svg
  body += text(pad + 20, ny + 46, notes.note || `Total ${totalDays} hari kerja (${weeks} minggu).`, { size: 14, color: C.ink, width: 760, maxLines: 2, lineHeight: 17 }).svg
  phases.forEach((name, i) => {
    const x = pad + 820 + i * ((W - pad * 2 - 840) / Math.max(phases.length, 1))
    body += circle(x + 8, ny + noteH / 2, 8, CYCLE[i % CYCLE.length])
    body += text(x + 22, ny + noteH / 2 + 5, name, { size: 14, color: C.ink, width: 130, maxLines: 1 }).svg
  })

  if (!rows.length) body += text(pad, ry + 60, 'Timeline belum memiliki aktivitas.', { size: 22, color: C.muted, width: W - pad * 2, anchor: 'middle' }).svg
  return svgDoc(W, H, body, C.white)
}
