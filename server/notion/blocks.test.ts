import { describe, expect, it } from 'vitest'
import { batches, markdownToBlocks, type NotionBlock } from './blocks.ts'

const body = (b: NotionBlock) => b[b.type] as Record<string, unknown>
const plain = (b: NotionBlock) => ((body(b).rich_text as { text: { content: string } }[]) ?? []).map((r) => r.text.content).join('')

describe('markdownToBlocks', () => {
  it('maps headings (capped at h3), paragraphs with marks, and dividers', () => {
    const blocks = markdownToBlocks('# A\n\n#### Deep\n\nHalo **tebal** dan _miring_ `kode` [link](https://cekat.ai)\n\n---')
    expect(blocks.map((b) => b.type)).toEqual(['heading_1', 'heading_3', 'paragraph', 'divider'])
    const runs = body(blocks[2]).rich_text as { text: { content: string; link?: { url: string } }; annotations?: Record<string, boolean> }[]
    expect(runs.find((r) => r.text.content === 'tebal')?.annotations).toEqual({ bold: true })
    expect(runs.find((r) => r.text.content === 'miring')?.annotations).toEqual({ italic: true })
    expect(runs.find((r) => r.text.content === 'kode')?.annotations).toEqual({ code: true })
    expect(runs.find((r) => r.text.content === 'link')?.text.link).toEqual({ url: 'https://cekat.ai' })
  })

  it('drops relative links (e.g. #anchors) but keeps their text', () => {
    const [p] = markdownToBlocks('- [TOR](#tor)')
    expect(p.type).toBe('bulleted_list_item')
    expect(JSON.stringify(p)).not.toContain('#tor')
    expect(plain(p)).toBe('TOR')
  })

  it('keeps mermaid code blocks with their language', () => {
    const [code] = markdownToBlocks('```mermaid\nflowchart TD\n  A --> B\n```')
    expect(code.type).toBe('code')
    expect(body(code).language).toBe('mermaid')
    expect(plain(code)).toBe('flowchart TD\n  A --> B')
  })

  it('turns GFM tables into Notion tables, <br> into line breaks, and splits long tables', () => {
    const rows = Array.from({ length: 150 }, (_, i) => `| ${i} | a<br>b |`).join('\n')
    const blocks = markdownToBlocks(`| No | Isi |\n| --- | --- |\n${rows}`)
    expect(blocks.map((b) => b.type)).toEqual(['table', 'table'])
    const first = body(blocks[0])
    expect(first.table_width).toBe(2)
    const firstRows = first.children as NotionBlock[]
    expect(firstRows).toHaveLength(100)
    expect(JSON.stringify(firstRows[0])).toContain('"No"')
    expect(JSON.stringify(firstRows[1])).toContain('a\\nb')
    expect((body(blocks[1]).children as NotionBlock[])[0]).toEqual(firstRows[0])
  })

  it('splits text longer than 2000 characters into several runs', () => {
    const [p] = markdownToBlocks('x'.repeat(4500))
    const runs = body(p).rich_text as { text: { content: string } }[]
    expect(runs.map((r) => r.text.content.length)).toEqual([2000, 2000, 500])
  })

  it('nests one level of list children and flattens deeper ones', () => {
    const [item] = markdownToBlocks('- a\n  - b\n    - c')
    const children = body(item).children as NotionBlock[]
    expect(children.map(plain)).toEqual(['b', 'c'])
    expect(children.every((c) => body(c).children === undefined)).toBe(true)
  })
})

describe('batches', () => {
  it('splits into request-sized groups', () => {
    expect(batches(Array.from({ length: 250 }, (_, i) => i)).map((b) => b.length)).toEqual([100, 100, 50])
  })
})
