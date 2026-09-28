import { describe, expect, it } from 'vitest'
import { demoteHeadings, projectMarkdown, type ProjectDoc } from './projectMarkdown.ts'

const project = { name: 'Xhealth Appointment', client_name: 'Xhealth', industry: 'Health', package: 'Enterprise', status: 'discovery', language: 'Bahasa Indonesia', description: 'AI booking' }

const docs: ProjectDoc[] = [
  { type: 'diagram', title: 'Alur Booking', version: 2, updated_at: '2026-09-27T10:00:00Z', content: { kind: 'flowchart', title: 'Alur Booking', mermaid: 'flowchart TD\n  A --> B', explanation: '' } },
  { type: 'tor', title: 'TOR Xhealth', version: 1, updated_at: '2026-09-28T10:00:00Z', content: { rows: [{ layanan: 'AI Agent', sub_layanan: 'Booking', deskripsi: 'Booking via WA', note: '', raised_by: '' }] } },
  { type: 'assessment', title: 'Assessment', version: 3, updated_at: '2026-09-28T10:00:00Z', content: { language: 'id', summary: 'Ringkas', rows: [] } },
]

describe('demoteHeadings', () => {
  it('nests headings one level but leaves code fences alone', () => {
    expect(demoteHeadings('# A\n## B\n```mermaid\n# not a heading\n```\ntext')).toBe('## A\n### B\n```mermaid\n# not a heading\n```\ntext')
  })

  it('demotes several levels but never past h6', () => {
    expect(demoteHeadings('# A\n### B', 4)).toBe('##### A\n###### B')
  })
})

describe('projectMarkdown', () => {
  const md = projectMarkdown(
    project,
    docs,
    [
      { question: 'Berapa cabang?', status: 'answered', answer: '5 cabang' },
      { question: 'Versi DA?', status: 'open', answer: '' },
      { question: 'Dropped', status: 'dropped', answer: '' },
    ],
    [{ name: 'POC 01', config: { agentBehavior: '# Identitas\nKamu Agata', welcomeMessage: 'Halo!', crm: { boards: [{ name: 'Booking', stages: [{ name: 'Baru', condition: '' }] }] } } }],
    new Date('2026-09-28T00:00:00Z'),
  )

  it('starts with the project and its facts', () => {
    expect(md.startsWith('# Xhealth Appointment\n\n| Field | Value |')).toBe(true)
    expect(md).toContain('| Exported | 2026-09-28 |')
  })

  it('orders deliverables by the pipeline, diagrams last, each one level below the project', () => {
    const order = ['## Assessment — Assessment Requirement', '## TOR Xhealth — TOR', '## Alur Booking — Diagram'].map((h) => md.indexOf(h))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(md).toContain('```mermaid\nflowchart TD')
    expect(md).toContain('_v3 · updated 2026-09-28_')
  })

  it('lists answered and open questions but not dropped ones, and the POC with its CRM board', () => {
    expect(md).toContain('| Berapa cabang? | 5 cabang |')
    expect(md).toContain('- Versi DA?')
    expect(md).not.toContain('Dropped')
    expect(md).toContain('### POC 01')
    expect(md).toContain('#### AI Agent Behavior\n\n##### Identitas')
    expect(md.match(/^# /gm)).toHaveLength(1)
    expect(md).toContain('#### CRM board: Booking')
    expect(md).toContain('| Lead (text) | Status (select) |')
  })

  it('does not repeat the type when the title already is the type', () => {
    const one = projectMarkdown(project, [{ ...docs[1], title: 'TOR' }], [], [])
    expect(one).toContain('## TOR\n')
    expect(one).not.toContain('TOR — TOR')
  })

  it('links the table of contents to the headings', () => {
    expect(md).toContain('- [TOR Xhealth — TOR](#tor-xhealth--tor)')
  })
})
