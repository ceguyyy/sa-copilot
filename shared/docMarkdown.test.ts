import { describe, expect, test } from 'vitest'
import { escapeCell, toMarkdown } from './docMarkdown.ts'

describe('escapeCell', () => {
  test('escapes pipes and flattens newlines so tables stay intact', () => {
    expect(escapeCell('a | b\nc')).toBe('a \\| b<br>c')
  })
})

describe('toMarkdown', () => {
  test('renders TOR rows as a table', () => {
    const md = toMarkdown('tor', 'TOR', {
      rows: [{ layanan: 'Business', sub_layanan: '7 Human Agents', deskripsi: 'Seat 7', note: '', raised_by: '' }],
    })
    expect(md).toContain('# TOR')
    expect(md).toContain('| Layanan | Sub Layanan | Deskripsi | Note | Raised By |')
    expect(md).toContain('| Business | 7 Human Agents | Seat 7 |  |  |')
  })

  test('renders SOW meta and sections in order', () => {
    const md = toMarkdown('sow_cekat', 'SOW', {
      meta: [{ key: 'Client Name', value: 'ACME' }],
      sections: [
        { title: 'Latar Belakang', markdown: 'Isi A' },
        { title: 'Out of Scope', markdown: '- x' },
      ],
    })
    expect(md).toContain('**Client Name:** ACME')
    expect(md.indexOf('## Latar Belakang')).toBeLessThan(md.indexOf('## Out of Scope'))
  })

  test('renders a timeline with totals from the schedule', () => {
    const md = toMarkdown('timeline', 'Timeline', {
      title: 'T',
      start_date: '',
      rows: [
        { no: '1', activity: 'Kickoff', module: '', function: '', pic: 'Cekat', days: 1, parallel: false },
        { no: '2', activity: 'AI', module: 'Train', function: 'x', pic: 'Cekat', days: 4, parallel: false },
      ],
      notes: ['*note'],
    })
    expect(md).toContain('Total: **5 mandays** · IT delivery: **0 mandays** · duration 5 working days (1 weeks)')
    expect(md).toContain('*note')
  })

  test('wraps diagrams in a mermaid fence', () => {
    const md = toMarkdown('diagram', 'D', { kind: 'flowchart', title: 'D', mermaid: 'flowchart LR\nA-->B', explanation: 'e' })
    expect(md).toContain('```mermaid\nflowchart LR\nA-->B\n```')
  })
})
