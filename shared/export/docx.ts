import type { DocType } from '../schemas.ts'
import { toMarkdown } from '../docMarkdown.ts'

export const DOCX_TYPES: DocType[] = ['sow_cekat', 'sow_cif', 'custom', 'onboarding', 'assessment', 'tor', 'timeline']

type Docx = typeof import('docx')

/** Builds a .docx from the document's markdown rendering (headings, lists, tables, bold/italic). */
export async function exportDocx(type: DocType, title: string, content: unknown): Promise<Blob> {
  const d = await import('docx')
  const md = toMarkdown(type, title, content as never)
  const doc = new d.Document({
    creator: 'SA Copilot',
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: markdownToBlocks(d, md) }],
  })
  return d.Packer.toBlob(doc)
}

function markdownToBlocks(d: Docx, md: string): (InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>)[] {
  const lines = md.split('\n')
  const blocks: (InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>)[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(new d.Paragraph({ children: [new d.TextRun({ text: code.join('\n'), font: 'Consolas', size: 18, break: 0 })] }))
      continue
    }
    if (line.trim().startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++])
      blocks.push(table(d, rows))
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = [d.HeadingLevel.TITLE, d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][heading[1].length - 1]
      blocks.push(new d.Paragraph({ heading: level, children: inline(d, heading[2]) }))
    } else if (/^\s*[-*]\s+/.test(line)) {
      blocks.push(new d.Paragraph({ bullet: { level: 0 }, children: inline(d, line.replace(/^\s*[-*]\s+/, '')) }))
    } else if (/^\s*\d+\.\s+/.test(line)) {
      blocks.push(new d.Paragraph({ children: inline(d, line.trim()), indent: { left: 360 } }))
    } else if (line.trim()) {
      blocks.push(new d.Paragraph({ children: inline(d, line.replace(/\s{2}$/, '')), spacing: { after: 120 } }))
    }
    i++
  }
  return blocks
}

function splitRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
}

function table(d: Docx, rows: string[]) {
  const parsed = rows.map(splitRow).filter((cells) => !cells.every((c) => /^:?-{3,}:?$/.test(c)))
  const width = Math.max(...parsed.map((r) => r.length))
  return new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: parsed.map(
      (cells, rowIdx) =>
        new d.TableRow({
          tableHeader: rowIdx === 0,
          children: Array.from({ length: width }, (_, c) =>
            new d.TableCell({
              shading: rowIdx === 0 ? { fill: '1F3B34', type: d.ShadingType.CLEAR, color: 'auto' } : undefined,
              children: (cells[c] ?? '').split('<br>').map(
                (part) =>
                  new d.Paragraph({
                    children: inline(d, part, rowIdx === 0 ? { bold: true, color: 'FFFFFF' } : {}),
                  }),
              ),
            }),
          ),
        }),
    ),
  })
}

function inline(d: Docx, text: string, base: { bold?: boolean; color?: string } = {}) {
  const runs: InstanceType<Docx['TextRun']>[] = []
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) runs.push(new d.TextRun({ text: text.slice(last, m.index), ...base }))
    const tok = m[0]
    if (tok.startsWith('**')) runs.push(new d.TextRun({ text: tok.slice(2, -2), ...base, bold: true }))
    else runs.push(new d.TextRun({ text: tok.slice(1, -1), ...base, italics: true }))
    last = m.index! + tok.length
  }
  if (last < text.length) runs.push(new d.TextRun({ text: text.slice(last), ...base }))
  return runs
}
