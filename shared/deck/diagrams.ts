// Infographics for slides 31 (architecture), 32 (CRM data flow) and 33 (marketing journey).
import { C, CYCLE, arrow, circle, rect, svgDoc, text, tint } from './svg.ts'
import type { DeckContent } from './types.ts'

/** Slide 31 — numbered stage columns from first contact to post-care, over an integration layer. 3.2 : 1 */
export function architectureSvg(a: DeckContent['architecture']): string {
  const W = 1920
  const H = 600
  const pad = 24
  const stages = a.stages.slice(0, 8)
  const n = Math.max(stages.length, 1)
  const gap = 22
  const colW = (W - pad * 2 - gap * (n - 1)) / n
  const top = 78
  const colH = 400

  let body = text(pad, 50, a.title || 'End-to-End Architecture', { size: 34, weight: 800, color: C.navy, width: W - pad * 2, maxLines: 1 }).svg
  stages.forEach((s, i) => {
    const x = pad + i * (colW + gap)
    const color = CYCLE[i % CYCLE.length]
    body += rect(x, top, colW, colH, { fill: C.white, stroke: tint(color, 0.45), r: 14, sw: 2 })
    body += rect(x, top, colW, 96, { fill: tint(color, 0.12), r: 14 }) + rect(x, top + 80, colW, 16, { fill: tint(color, 0.12) })
    body += circle(x + 30, top + 32, 18, color) + text(x + 12, top + 40, String(i + 1), { size: 20, weight: 800, color: C.white, width: 36, anchor: 'middle' }).svg
    body += text(x + 56, top + 30, s.title.toUpperCase(), { size: 17, weight: 800, color, width: colW - 66, maxLines: 2, lineHeight: 20 }).svg
    body += text(x + 14, top + 82, s.subtitle, { size: 14, color: C.muted, width: colW - 28, maxLines: 1 }).svg
    let y = top + 124
    const d = text(x + 14, y, s.description, { size: 16, color: C.ink, width: colW - 28, maxLines: 4, lineHeight: 20 })
    body += d.svg
    y += d.height + 14
    for (const b of s.bullets.slice(0, 4)) {
      if (y > top + colH - 24) break
      body += circle(x + 20, y - 5, 4, color)
      const t = text(x + 32, y, b, { size: 15, color: C.ink, width: colW - 44, maxLines: 2, lineHeight: 19 })
      body += t.svg
      y += t.height + 8
    }
    if (i < n - 1) body += arrow(x + colW + gap / 2, top + colH / 2, 10, tint(C.navy, 0.55))
  })

  const barY = top + colH + 22
  body += rect(pad, barY, W - pad * 2, H - barY - 16, { fill: tint(C.blue, 0.07), stroke: tint(C.blue, 0.35), r: 14, sw: 2 })
  body += text(pad + 20, barY + 34, 'INTEGRATION LAYER', { size: 19, weight: 800, color: C.navy, width: 260, maxLines: 1 }).svg
  body += text(pad + 20, barY + 60, 'Two-way API / Webhook data sync', { size: 14, color: C.muted, width: 300, maxLines: 1 }).svg
  const items = a.integrations.slice(0, 7)
  const itemW = (W - pad * 2 - 340) / Math.max(items.length, 1)
  items.forEach((it, i) => {
    const x = pad + 330 + i * itemW
    body += rect(x, barY + 18, itemW - 14, H - barY - 52, { fill: C.white, stroke: C.line, r: 10, sw: 1.5 })
    body += text(x + 10, barY + 46, it, { size: 16, weight: 700, color: C.navy, width: itemW - 34, maxLines: 2, lineHeight: 19, anchor: 'middle' }).svg
  })
  return svgDoc(W, H, body)
}

/** Slide 32 — five data-flow steps, a feature strip and the main outcomes. ≈1.82 : 1 */
export function crmFlowSvg(f: DeckContent['crmFlow']): string {
  const W = 1920
  const H = 1054
  const pad = 40
  let body = text(pad, 70, f.title || 'CRM - Alur Data & Fitur', { size: 44, weight: 800, color: C.navy, width: W - pad * 2, maxLines: 1, anchor: 'middle' }).svg
  body += text(pad, 112, f.subtitle, { size: 22, color: C.muted, width: W - pad * 2, maxLines: 1, anchor: 'middle' }).svg

  const steps = f.steps.slice(0, 5)
  const gap = 34
  const colW = (W - pad * 2 - gap * (steps.length - 1)) / Math.max(steps.length, 1)
  const top = 140
  const colH = 470
  steps.forEach((s, i) => {
    const x = pad + i * (colW + gap)
    const color = [C.green, C.blue, C.teal, C.cyan, C.green][i % 5]
    body += rect(x, top, colW, colH, { fill: C.white, stroke: C.line, r: 18, sw: 2 })
    body += circle(x + 36, top + 40, 22, color) + text(x + 14, top + 49, String(i + 1), { size: 24, weight: 800, color: C.white, width: 44, anchor: 'middle' }).svg
    const t = text(x + 70, top + 36, s.title.toUpperCase(), { size: 21, weight: 800, color: C.navy, width: colW - 84, maxLines: 2, lineHeight: 25 })
    body += t.svg
    let y = top + 36 + Math.max(t.height, 50) + 12
    const d = text(x + 22, y, s.description, { size: 18, color: C.ink, width: colW - 44, maxLines: 3, lineHeight: 23 })
    body += d.svg
    y += d.height + 14
    for (const item of s.items.slice(0, 5)) {
      if (y > top + colH - 30) break
      body += rect(x + 20, y - 26, colW - 40, 44, { fill: tint(color, 0.08), stroke: tint(color, 0.25), r: 10, sw: 1.5 })
      body += rect(x + 32, y - 13, 16, 16, { fill: color, r: 4 })
      body += text(x + 58, y + 1, item, { size: 17, weight: 600, color: C.ink, width: colW - 90, maxLines: 1 }).svg
      y += 54
    }
    if (i < steps.length - 1) body += arrow(x + colW + gap / 2, top + colH / 2, 13, tint(C.blue, 0.7))
  })

  const fy = top + colH + 28
  const fh = 200
  body += rect(pad, fy, W - pad * 2, fh, { fill: C.white, stroke: C.line, r: 18, sw: 2 })
  body += text(pad, fy + 36, 'FITUR CRM CEKAT.AI', { size: 20, weight: 800, color: C.navy, width: W - pad * 2, anchor: 'middle' }).svg
  const feats = f.features.slice(0, 8)
  const fw = (W - pad * 2) / Math.max(feats.length, 1)
  feats.forEach((ft, i) => {
    const cx = pad + i * fw + fw / 2
    body += circle(cx, fy + 84, 26, tint(CYCLE[i % CYCLE.length], 0.15)) + circle(cx, fy + 84, 10, CYCLE[i % CYCLE.length])
    body += text(cx - fw / 2 + 10, fy + 136, ft.title, { size: 17, weight: 700, color: C.ink, width: fw - 20, maxLines: 2, lineHeight: 20, anchor: 'middle' }).svg
    body += text(cx - fw / 2 + 10, fy + 180, ft.subtitle, { size: 14, color: C.muted, width: fw - 20, maxLines: 1, anchor: 'middle' }).svg
  })

  const oy = fy + fh + 24
  const oh = H - oy - 24
  body += rect(pad, oy, W - pad * 2, oh, { fill: C.white, stroke: C.line, r: 18, sw: 2 })
  body += rect(pad, oy, 300, oh, { fill: C.green, r: 18 }) + rect(pad + 280, oy, 20, oh, { fill: C.green })
  body += text(pad + 24, oy + oh / 2 + 10, 'OUTPUT UTAMA', { size: 28, weight: 800, color: C.white, width: 260 }).svg
  const outs = f.outputs.slice(0, 5)
  const ow = (W - pad * 2 - 320) / Math.max(outs.length, 1)
  outs.forEach((o, i) => {
    const x = pad + 320 + i * ow
    body += circle(x + 24, oy + oh / 2, 14, tint(C.green, 0.25)) + circle(x + 24, oy + oh / 2, 6, C.green)
    body += text(x + 48, oy + oh / 2 - 4, o, { size: 18, weight: 700, color: C.ink, width: ow - 60, maxLines: 2, lineHeight: 21 }).svg
  })
  return svgDoc(W, H, body, C.bg)
}

/** Slide 33 — five-stage marketing journey with channel, automated actions and a KPI per stage. ≈1.79 : 1 */
export function marketingSvg(m: DeckContent['marketing']): string {
  const W = 1800
  const H = 1006
  const pad = 30
  const stages = m.stages.slice(0, 5)
  const n = Math.max(stages.length, 1)
  const gap = 18
  const colW = (W - pad * 2 - gap * (n - 1)) / n
  const colors = [C.blue, C.cyan, C.teal, C.green, C.orange]
  let body = ''

  stages.forEach((s, i) => {
    const x = pad + i * (colW + gap)
    const color = colors[i % colors.length]
    // Chevron header
    const hy = 40
    const hh = 110
    const tip = 26
    body += `<path d="M${x} ${hy} H${x + colW - tip} L${x + colW} ${hy + hh / 2} L${x + colW - tip} ${hy + hh} H${x} ${i === 0 ? '' : `L${x + tip} ${hy + hh / 2}`} Z" fill="${color}"/>`
    body += text(x + (i === 0 ? 20 : tip + 10), hy + 44, `0${i + 1}`, { size: 22, weight: 800, color: tint(C.white, 0.75), width: 60 }).svg
    body += text(x + (i === 0 ? 20 : tip + 10), hy + 82, s.title.toUpperCase(), { size: 26, weight: 800, color: C.white, width: colW - tip * 2 - 20, maxLines: 1 }).svg

    const top = hy + hh + 26
    const colH = H - top - 40
    body += rect(x, top, colW, colH, { fill: C.white, stroke: tint(color, 0.4), r: 16, sw: 2 })
    body += rect(x + 18, top + 20, colW - 36, 48, { fill: tint(color, 0.12), r: 24 })
    body += text(x + 18, top + 52, s.channel, { size: 19, weight: 700, color, width: colW - 36, maxLines: 1, anchor: 'middle' }).svg
    let y = top + 110
    for (const action of s.actions.slice(0, 4)) {
      body += circle(x + 30, y - 7, 6, color)
      const t = text(x + 46, y, action, { size: 19, color: C.ink, width: colW - 66, maxLines: 3, lineHeight: 24 })
      body += t.svg
      y += t.height + 18
    }
    body += rect(x + 18, top + colH - 100, colW - 36, 80, { fill: tint(color, 0.08), stroke: tint(color, 0.3), r: 12, sw: 1.5 })
    body += text(x + 32, top + colH - 70, 'KPI', { size: 15, weight: 800, color, width: colW - 64 }).svg
    body += text(x + 32, top + colH - 42, s.kpi, { size: 18, weight: 700, color: C.ink, width: colW - 64, maxLines: 1 }).svg
  })
  return svgDoc(W, H, body, C.white)
}
