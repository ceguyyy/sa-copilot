// Markdown (GFM) → Notion API blocks, within Notion's request limits: ≤2000 chars per text object,
// ≤100 rich-text items per block, ≤100 children per request (long tables are split, header repeated).
import type { PhrasingContent, RootContent, Table } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

export interface RichText {
  type: 'text'
  text: { content: string; link?: { url: string } | null }
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean }
}

export type NotionBlock = { object: 'block'; type: string } & Record<string, unknown>

const MAX_TEXT = 2000
const MAX_RICH = 100
export const MAX_CHILDREN = 100
const TABLE_ROWS = MAX_CHILDREN - 1 // one row is the repeated header

type Marks = NonNullable<RichText['annotations']>

const CODE_LANGUAGES = new Set(['bash', 'css', 'html', 'java', 'javascript', 'json', 'markdown', 'mermaid', 'python', 'shell', 'sql', 'typescript', 'xml', 'yaml'])

function textRun(content: string, marks: Marks, url?: string): RichText[] {
  const runs: RichText[] = []
  for (let i = 0; i < content.length; i += MAX_TEXT) {
    const annotations = Object.keys(marks).length ? { ...marks } : undefined
    runs.push({ type: 'text', text: { content: content.slice(i, i + MAX_TEXT), ...(url ? { link: { url } } : {}) }, ...(annotations ? { annotations } : {}) })
  }
  return runs
}

const isHttp = (url: string) => /^https?:\/\//i.test(url)

function inline(nodes: PhrasingContent[], marks: Marks = {}, url?: string): RichText[] {
  return nodes.flatMap((node): RichText[] => {
    switch (node.type) {
      case 'text':
        return textRun(node.value, marks, url)
      case 'inlineCode':
        return textRun(node.value, { ...marks, code: true }, url)
      case 'strong':
        return inline(node.children, { ...marks, bold: true }, url)
      case 'emphasis':
        return inline(node.children, { ...marks, italic: true }, url)
      case 'delete':
        return inline(node.children, { ...marks, strikethrough: true }, url)
      case 'link':
        // Notion rejects relative links (e.g. the #anchors of our table of contents): keep only the text.
        return inline(node.children, marks, isHttp(node.url) ? node.url : url)
      case 'break':
        return textRun('\n', marks, url)
      case 'html':
        return textRun(/^<br\s*\/?>$/i.test(node.value.trim()) ? '\n' : node.value, marks, url)
      default:
        return 'value' in node && typeof node.value === 'string' ? textRun(node.value, marks, url) : []
    }
  })
}

/** Merges neighbouring runs with the same formatting and caps the list at Notion's 100 items. */
function compact(runs: RichText[]): RichText[] {
  const out: RichText[] = []
  for (const run of runs) {
    const last = out[out.length - 1]
    const same = last && JSON.stringify(last.annotations) === JSON.stringify(run.annotations) && JSON.stringify(last.text.link) === JSON.stringify(run.text.link)
    if (same && last.text.content.length + run.text.content.length <= MAX_TEXT) last.text = { ...last.text, content: last.text.content + run.text.content }
    else out.push({ ...run, text: { ...run.text } })
  }
  if (out.length <= MAX_RICH) return out
  const kept = out.slice(0, MAX_RICH - 1)
  return [...kept, { type: 'text', text: { content: '…' } }]
}

const rich = (runs: RichText[]) => ({ rich_text: compact(runs) })
const block = (type: string, body: Record<string, unknown>): NotionBlock => ({ object: 'block', type, [type]: body })

/** One table row: a rich-text list per cell. */
type Cells = RichText[][]

function tableBlocks(node: Table): NotionBlock[] {
  const rows: Cells[] = node.children.map((row) => row.children.map((cell) => compact(inline(cell.children))))
  const width = Math.max(1, ...rows.map((r) => r.length))
  const toRow = (cells: Cells) => block('table_row', { cells: Array.from({ length: width }, (_, i) => cells[i] ?? []) })
  const [header = [], ...body] = rows
  const chunks: Cells[][] = []
  for (let i = 0; i < Math.max(1, body.length); i += TABLE_ROWS) chunks.push(body.slice(i, i + TABLE_ROWS))
  return chunks.map((chunk) => block('table', { table_width: width, has_column_header: true, has_row_header: false, children: [header, ...chunk].map(toRow) }))
}

function convert(node: RootContent, depth: number): NotionBlock[] {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(3, node.depth)
      return [block(`heading_${level}`, rich(inline(node.children)))]
    }
    case 'paragraph':
      return [block('paragraph', rich(inline(node.children)))]
    case 'blockquote':
      return [block('quote', rich(node.children.flatMap((c) => (c.type === 'paragraph' ? [...inline(c.children), ...textRun('\n', {})] : [])).slice(0, -1)))]
    case 'code': {
      const lang = (node.lang ?? '').toLowerCase()
      return [block('code', { ...rich(textRun(node.value, {})), language: CODE_LANGUAGES.has(lang) ? lang : 'plain text' })]
    }
    case 'thematicBreak':
      return [block('divider', {})]
    case 'table':
      return tableBlocks(node)
    case 'list':
      return node.children.flatMap((item) => {
        const [first, ...rest] = item.children
        const text = first?.type === 'paragraph' ? inline(first.children) : []
        const nested = rest.flatMap((c) => convert(c, depth + 1))
        const type = node.ordered ? 'numbered_list_item' : 'bulleted_list_item'
        // A request may nest two levels; deeper items become siblings right after their parent.
        return depth < 1
          ? [block(type, { ...rich(text), ...(nested.length ? { children: nested } : {}) })]
          : [block(type, rich(text)), ...nested]
      })
    case 'html':
      return node.value.trim() ? [block('paragraph', rich(textRun(node.value, {})))] : []
    default:
      return []
  }
}

export function markdownToBlocks(markdown: string): NotionBlock[] {
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  return tree.children.flatMap((node) => convert(node, 0))
}

/** Splits blocks into request-sized batches. */
export function batches<T>(items: T[], size = MAX_CHILDREN): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
