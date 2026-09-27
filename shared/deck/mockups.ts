// Product mockups for slides 34–39: WhatsApp phone, CRM table, kanban board, analytics dashboard.
import { C, CYCLE, appWindow, circle, esc, rect, svgDoc, text, textWidth, tint, wrap } from './svg.ts'
import type { DeckContent, MockupSlide } from './types.ts'

/** Slides 34–36 — a phone showing the WhatsApp conversation of the use case. ≈0.55 : 1 */
export function phoneSvg(m: MockupSlide): string {
  const W = 440
  const H = 800
  const frame = 14
  const header = 64
  const inputH = 58
  const screen = { x: frame, y: frame, w: W - frame * 2, h: H - frame * 2 }
  let body = rect(0, 0, W, H, { fill: '#1d1f24', r: 58 })
  body += rect(screen.x, screen.y, screen.w, screen.h, { fill: C.chatBg, r: 46 })
  body += rect(screen.x, screen.y, screen.w, header + 28, { fill: C.whatsapp, r: 46 }) + rect(screen.x, screen.y + 40, screen.w, header - 12, { fill: C.whatsapp })
  body += rect(W / 2 - 60, screen.y + 8, 120, 22, { fill: '#1d1f24', r: 11 })
  const hy = screen.y + 40
  body += circle(screen.x + 44, hy + 22, 18, tint(C.white, 0.9)) + text(screen.x + 26, hy + 29, 'AI', { size: 14, weight: 800, color: C.whatsapp, width: 36, anchor: 'middle' }).svg
  body += text(screen.x + 72, hy + 20, m.botName || 'AI Assistant', { size: 18, weight: 700, color: C.white, width: screen.w - 100, maxLines: 1 }).svg
  body += text(screen.x + 72, hy + 40, 'online', { size: 13, color: tint(C.white, 0.8), width: 100 }).svg

  // Lay bubbles bottom-up so the latest messages stay visible when the chat is long.
  const areaTop = hy + header - 4
  const areaBottom = screen.y + screen.h - inputH - 10
  const maxBubble = screen.w * 0.74
  const size = 15
  const lh = 19
  const bubbles: string[] = []
  let y = areaBottom
  for (const msg of [...m.chat].reverse()) {
    const lines = wrap(msg.text, maxBubble - 26, size, { maxLines: 7 })
    const w = Math.min(maxBubble, Math.max(...lines.map((l) => textWidth(l, size))) + 26, maxBubble)
    const h = lines.length * lh + 30
    if (y - h < areaTop) break
    y -= h
    const out = msg.from === 'customer'
    const x = out ? screen.x + screen.w - w - 12 : screen.x + 12
    let b = rect(x, y, Math.max(w, 70), h, { fill: out ? C.bubbleOut : C.white, r: 12 })
    lines.forEach((l, i) => {
      b += `<text x="${x + 13}" y="${y + 22 + i * lh}" font-family="Arial, sans-serif" font-size="${size}" fill="${C.ink}">${esc(l)}</text>`
    })
    b += text(x + Math.max(w, 70) - 56, y + h - 7, out ? '13:25 ✓✓' : '13:24', { size: 10, color: C.muted, width: 50, anchor: 'end' }).svg
    bubbles.unshift(b)
    y -= 10
  }
  body += bubbles.join('')

  const iy = screen.y + screen.h - inputH
  body += rect(screen.x + 10, iy, screen.w - 76, 44, { fill: C.white, r: 22 })
  body += text(screen.x + 30, iy + 28, 'Message', { size: 15, color: C.muted, width: 120 }).svg
  body += circle(screen.x + screen.w - 34, iy + 22, 22, C.whatsapp)
  return svgDoc(W, H, body, 'none')
}

const STATUS_COLORS: [RegExp, string][] = [
  [/(done|closed|selesai|won|resolved|complete|paid|lunas)/i, C.green],
  [/(new|baru|open|lead)/i, C.blue],
  [/(progress|proses|follow|review|pending|menunggu)/i, C.orange],
  [/(urgent|high|lost|gagal|overdue|batal|critical)/i, C.red],
]
const statusColor = (v: string) => STATUS_COLORS.find(([re]) => re.test(v))?.[1] ?? C.purple

/** Slide 37 — CRM list view. ≈2.63 : 1 */
export function crmTableSvg(c: DeckContent['crm']): string {
  const W = 2100
  const H = 800
  const win = appWindow(W, H, c.title || 'CRM', ['Inbox', 'Contacts', 'CRM', 'Broadcast', 'Analytics', 'Settings'], 2)
  let body = win.svg
  const cols = c.columns.slice(0, 6)
  const statusCol = cols.findIndex((col) => /(status|stage|tahap|prioritas|priority)/i.test(col))
  const rows = c.rows.slice(0, 8)
  const colW = win.w / Math.max(cols.length, 1)
  body += rect(win.x, win.y, win.w, 58, { fill: C.bg, r: 10 })
  cols.forEach((col, i) => {
    body += text(win.x + i * colW + 18, win.y + 37, col.toUpperCase(), { size: 16, weight: 800, color: C.muted, width: colW - 30, maxLines: 1 }).svg
  })
  const rowH = Math.min(74, (win.h - 70) / Math.max(rows.length, 1))
  rows.forEach((row, r) => {
    const y = win.y + 66 + r * rowH
    if (r % 2) body += rect(win.x, y, win.w, rowH, { fill: tint(C.bg, 0.7) })
    body += `<line x1="${win.x}" y1="${y + rowH}" x2="${win.x + win.w}" y2="${y + rowH}" stroke="${C.line}"/>`
    cols.forEach((_, i) => {
      const value = row[i] ?? ''
      const x = win.x + i * colW + 18
      if (i === statusCol && value) {
        const color = statusColor(value)
        const w = Math.min(colW - 30, textWidth(value, 15, true) + 30)
        body += rect(x, y + rowH / 2 - 17, w, 34, { fill: tint(color, 0.14), r: 17 })
        body += text(x, y + rowH / 2 + 6, value, { size: 15, weight: 700, color, width: w, maxLines: 1, anchor: 'middle' }).svg
      } else {
        body += text(x, y + rowH / 2 + 7, value, { size: 18, weight: i === 0 ? 700 : 400, color: i === 0 ? C.ink : C.muted, width: colW - 30, maxLines: 1 }).svg
      }
    })
  })
  return svgDoc(W, H, body, 'none')
}

/** Slide 38 — kanban board. ≈2.02 : 1 */
export function kanbanSvg(k: DeckContent['kanban']): string {
  const W = 2020
  const H = 1000
  const win = appWindow(W, H, k.title || 'Kanban', ['Inbox', 'Tickets', 'Board', 'Customers', 'Reports'], 2)
  let body = win.svg
  const cols = k.columns.slice(0, 4)
  const gap = 22
  const colW = (win.w - gap * (cols.length - 1)) / Math.max(cols.length, 1)
  cols.forEach((col, i) => {
    const x = win.x + i * (colW + gap)
    const color = CYCLE[i % CYCLE.length]
    body += rect(x, win.y, colW, win.h, { fill: C.bg, r: 14 })
    body += rect(x, win.y, colW, 6, { fill: color, r: 3 })
    body += text(x + 18, win.y + 44, col.name, { size: 21, weight: 800, color: C.ink, width: colW - 80, maxLines: 1 }).svg
    body += rect(x + colW - 56, win.y + 22, 38, 30, { fill: tint(color, 0.15), r: 15 })
    body += text(x + colW - 56, win.y + 43, String(col.cards.length), { size: 16, weight: 800, color, width: 38, anchor: 'middle' }).svg
    let y = win.y + 70
    for (const card of col.cards.slice(0, 3)) {
      const t = wrap(card.title, colW - 60, 18, { bold: true, maxLines: 2 })
      const h = 38 + t.length * 23 + 34
      if (y + h > win.y + win.h - 10) break
      body += rect(x + 12, y, colW - 24, h, { fill: C.white, stroke: C.line, r: 12, sw: 1.5 }) + rect(x + 12, y + 12, 5, h - 24, { fill: color, r: 2 })
      body += text(x + 32, y + 32, card.title, { size: 18, weight: 700, color: C.ink, width: colW - 60, maxLines: 2, lineHeight: 23 }).svg
      body += text(x + 32, y + 34 + t.length * 23 + 12, card.meta, { size: 15, color: C.muted, width: colW - 60, maxLines: 1 }).svg
      y += h + 14
    }
  })
  return svgDoc(W, H, body, 'none')
}

/** Slide 39 — analytics dashboard: KPI cards, bar chart and a breakdown donut. ≈1.95 : 1 */
export function analyticsSvg(a: DeckContent['analytics']): string {
  const W = 1950
  const H = 1000
  const win = appWindow(W, H, a.title || 'Analytics', ['Overview', 'Conversations', 'CRM', 'Campaigns', 'Analytics'], 4)
  let body = win.svg
  const kpis = a.kpis.slice(0, 4)
  const gap = 20
  const kw = (win.w - gap * (kpis.length - 1)) / Math.max(kpis.length, 1)
  kpis.forEach((k, i) => {
    const x = win.x + i * (kw + gap)
    body += rect(x, win.y, kw, 150, { fill: C.white, stroke: C.line, r: 14, sw: 1.5 }) + rect(x, win.y, 6, 150, { fill: CYCLE[i], r: 3 })
    body += text(x + 24, win.y + 40, k.label, { size: 17, color: C.muted, width: kw - 40, maxLines: 1 }).svg
    body += text(x + 24, win.y + 96, k.value, { size: 42, weight: 800, color: C.ink, width: kw - 40, maxLines: 1 }).svg
    body += text(x + 24, win.y + 130, k.delta, { size: 15, weight: 700, color: /^-|↓|turun/.test(k.delta) ? C.red : C.green, width: kw - 40, maxLines: 1 }).svg
  })

  const cy = win.y + 176
  const ch = win.h - 176
  const chartW = win.w * 0.62
  body += rect(win.x, cy, chartW, ch, { fill: C.white, stroke: C.line, r: 14, sw: 1.5 })
  body += text(win.x + 24, cy + 40, a.chartTitle, { size: 20, weight: 800, color: C.ink, width: chartW - 48, maxLines: 1 }).svg
  const bars = a.bars.slice(0, 7)
  const max = Math.max(1, ...bars.map((b) => b.value))
  const plotTop = cy + 70
  const plotH = ch - 130
  const slot = (chartW - 60) / Math.max(bars.length, 1)
  bars.forEach((b, i) => {
    const h = (Math.max(b.value, 0) / max) * plotH
    const x = win.x + 30 + i * slot + slot * 0.18
    body += rect(x, plotTop + plotH - h, slot * 0.64, h, { fill: i === bars.length - 1 ? C.blue : tint(C.blue, 0.55), r: 8 })
    body += text(x - slot * 0.18, plotTop + plotH - h - 10, String(b.value), { size: 15, weight: 700, color: C.ink, width: slot, anchor: 'middle' }).svg
    body += text(x - slot * 0.18, plotTop + plotH + 30, b.label, { size: 15, color: C.muted, width: slot, maxLines: 1, anchor: 'middle' }).svg
  })

  const dx = win.x + chartW + 20
  const dw = win.w - chartW - 20
  body += rect(dx, cy, dw, ch, { fill: C.white, stroke: C.line, r: 14, sw: 1.5 })
  body += text(dx + 24, cy + 40, a.breakdownTitle, { size: 20, weight: 800, color: C.ink, width: dw - 48, maxLines: 1 }).svg
  const slices = a.breakdown.slice(0, 5)
  const total = slices.reduce((s, x) => s + Math.max(x.value, 0), 0) || 1
  const r = Math.min(dw * 0.28, ch * 0.24)
  const ox = dx + dw / 2
  const oy = cy + 90 + r
  let angle = -Math.PI / 2
  slices.forEach((s, i) => {
    const sweep = (Math.max(s.value, 0) / total) * Math.PI * 2
    const end = angle + sweep
    const large = sweep > Math.PI ? 1 : 0
    const [x1, y1, x2, y2] = [ox + r * Math.cos(angle), oy + r * Math.sin(angle), ox + r * Math.cos(end - 0.0001), oy + r * Math.sin(end - 0.0001)]
    body += `<path d="M${ox} ${oy} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${CYCLE[i % CYCLE.length]}"/>`
    angle = end
  })
  body += circle(ox, oy, r * 0.58, C.white)
  slices.forEach((s, i) => {
    const ly = oy + r + 50 + i * 34
    body += rect(dx + 30, ly - 14, 16, 16, { fill: CYCLE[i % CYCLE.length], r: 4 })
    body += text(dx + 56, ly, s.label, { size: 16, color: C.ink, width: dw - 150, maxLines: 1 }).svg
    body += text(dx + dw - 110, ly, `${Math.round((Math.max(s.value, 0) / total) * 100)}%`, { size: 16, weight: 700, color: C.ink, width: 80, anchor: 'end' }).svg
  })
  return svgDoc(W, H, body, 'none')
}
