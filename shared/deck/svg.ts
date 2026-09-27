// Tiny SVG toolkit for the deck visuals: palette, escaping, and text wrapping by estimated width.
// Output is plain SVG (no foreignObject) so it rasterises identically in resvg and the browser.

export const C = {
  navy: '#0b2e59',
  blue: '#1d63c9',
  teal: '#0f8b8d',
  green: '#1f8a4c',
  orange: '#e8891c',
  purple: '#7449c2',
  red: '#e0474c',
  cyan: '#1592b8',
  ink: '#18212f',
  muted: '#5b6778',
  line: '#d9e2ec',
  bg: '#f4f7fb',
  white: '#ffffff',
  whatsapp: '#0b8f6a',
  chatBg: '#ece5dd',
  bubbleOut: '#d9fdd3',
}

/** Stage colors, cycled for columns and phases. */
export const CYCLE = [C.blue, C.teal, C.purple, C.green, C.orange, C.navy, C.cyan, C.red]
export const tint = (hex: string, alpha: number) => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`

export const FONT = "Arial, 'Segoe UI', sans-serif"

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Average glyph width as a share of font size (Arial-ish); wide scripts get more room. */
function charWidth(ch: string, size: number, bold: boolean): number {
  if (/[　-鿿가-힯]/.test(ch)) return size * 1.0
  if (/[MW@%]/.test(ch)) return size * (bold ? 0.86 : 0.8)
  if (/[A-Z0-9&]/.test(ch)) return size * (bold ? 0.73 : 0.66)
  if (/[ il.,:;'|!]/.test(ch)) return size * 0.3
  return size * (bold ? 0.56 : 0.52)
}

export function textWidth(text: string, size: number, bold = false): number {
  let w = 0
  for (const ch of text) w += charWidth(ch, size, bold)
  return w
}

/** Greedy word wrap; the last allowed line gets an ellipsis when the text does not fit. */
export function wrap(text: string, maxWidth: number, size: number, opts: { bold?: boolean; maxLines?: number } = {}): string[] {
  const { bold = false, maxLines = Infinity } = opts
  const lines: string[] = []
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (textWidth(next, size, bold) <= maxWidth || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && textWidth(`${last}…`, size, bold) > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

interface TextOpts {
  size: number
  color?: string
  weight?: 400 | 600 | 700 | 800
  width: number
  maxLines?: number
  lineHeight?: number
  anchor?: 'start' | 'middle' | 'end'
}

/** Wrapped text starting with its first baseline at y. Returns the SVG and the height used. */
export function text(x: number, y: number, value: string, o: TextOpts): { svg: string; height: number } {
  const bold = (o.weight ?? 400) >= 600
  const lines = wrap(value, o.width, o.size, { bold, maxLines: o.maxLines })
  const lh = o.lineHeight ?? o.size * 1.25
  const tx = o.anchor === 'middle' ? x + o.width / 2 : o.anchor === 'end' ? x + o.width : x
  const svg = lines
    .map(
      (l, i) =>
        `<text x="${tx}" y="${y + i * lh}" font-family="${FONT}" font-size="${o.size}" font-weight="${o.weight ?? 400}" fill="${o.color ?? C.ink}" text-anchor="${o.anchor ?? 'start'}">${esc(l)}</text>`,
    )
    .join('')
  return { svg, height: lines.length * lh }
}

export function rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; r?: number; sw?: number } = {}): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 0}" fill="${o.fill ?? 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : ''}/>`
}

export function circle(cx: number, cy: number, r: number, fill: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`
}

/** Right-pointing arrow head used between flow columns. */
export function arrow(cx: number, cy: number, size: number, fill: string): string {
  return `<path d="M${cx - size / 2} ${cy - size} L${cx + size / 2} ${cy} L${cx - size / 2} ${cy + size} Z" fill="${fill}"/>`
}

export function svgDoc(width: number, height: number, body: string, background = C.white): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rect(0, 0, width, height, { fill: background })}${body}</svg>`
}

/** Minimal app window (title bar + optional sidebar) framing the CRM / kanban / analytics mockups. */
export function appWindow(width: number, height: number, title: string, nav: string[], active: number): { svg: string; x: number; y: number; w: number; h: number } {
  const bar = 56
  const side = 230
  let svg = rect(0, 0, width, height, { fill: C.white, stroke: C.line, r: 18, sw: 2 })
  svg += rect(0, 0, width, bar, { fill: C.navy, r: 18 }) + rect(0, bar - 18, width, 18, { fill: C.navy })
  svg += `${circle(28, bar / 2, 7, '#ff5f57')}${circle(50, bar / 2, 7, '#febc2e')}${circle(72, bar / 2, 7, '#28c840')}`
  svg += text(100, bar / 2 + 8, `Cekat.AI · ${title}`, { size: 22, weight: 700, color: C.white, width: width - 400 }).svg
  svg += rect(width - 320, 12, 290, bar - 24, { fill: tint(C.white, 0.15), r: 16 })
  svg += text(width - 300, bar / 2 + 7, 'Search…', { size: 18, color: tint(C.white, 0.7), width: 200 }).svg
  svg += rect(0, bar, side, height - bar, { fill: C.bg }) + `<line x1="${side}" y1="${bar}" x2="${side}" y2="${height}" stroke="${C.line}" stroke-width="2"/>`
  nav.forEach((item, i) => {
    const y = bar + 28 + i * 54
    if (i === active) svg += rect(14, y - 6, side - 28, 44, { fill: tint(C.blue, 0.12), r: 10 })
    svg += rect(30, y + 6, 20, 20, { fill: i === active ? C.blue : tint(C.muted, 0.35), r: 5 })
    svg += text(62, y + 23, item, { size: 19, weight: i === active ? 700 : 400, color: i === active ? C.blue : C.muted, width: side - 80, maxLines: 1 }).svg
  })
  return { svg, x: side + 30, y: bar + 26, w: width - side - 60, h: height - bar - 50 }
}
