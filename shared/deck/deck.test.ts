import { describe, expect, test } from 'vitest'
import type { TimelineContent } from '../schemas.ts'
import { deckProblems, deckVisuals, emptyDeck, type DeckContent } from './index.ts'
import { wrap } from './svg.ts'

const card = (t: string) => ({ title: t, description: `${t} description` })

export const SAMPLE_DECK: DeckContent = {
  cover: { title: 'Scaling Klinik X', presenter: 'Christian Gunawan', presenterRole: '' },
  architecture: { title: 'Arch <Klinik & Co>', tagline: 'Tagline', stages: [{ title: 'Entry', subtitle: 's', description: 'd', bullets: ['a', 'b'] }], integrations: ['HIS'] },
  crmFlow: { title: 'CRM', subtitle: 's', steps: [{ title: 'Collect', description: 'd', items: ['x'] }], features: [{ title: 'F', subtitle: 's' }], outputs: ['O'] },
  marketing: { outcome: 'o', stages: [{ title: 'Awareness', channel: 'IG', actions: ['a'], kpi: 'k' }] },
  mockups: [1, 2, 3].map((i) => ({ header: `H${i}`, title: `T${i}`, botName: 'Bot', chat: [{ from: 'bot' as const, text: 'Halo "Bu" Sari' }], cards: [card('TL'), card('TR'), card('BL'), card('BR')] })),
  crm: { header: 'MOCKUP CRM', title: 'CRM', description: 'd', columns: ['Name', 'Status'], rows: [['Sari', 'New']] },
  kanban: { header: 'MOCKUP KANBAN', title: 'K', description: 'd', columns: [{ name: 'New', cards: [{ title: 't', meta: 'm' }] }] },
  analytics: { header: 'MOCKUP ANALYTICS', title: 'A', description: 'd', kpis: [{ label: 'L', value: '1', delta: '+1' }], chartTitle: 'c', bars: [{ label: 'a', value: 3 }], breakdownTitle: 'b', breakdown: [{ label: 'x', value: 1 }] },
  timeline: { prerequisites: ['SOW Signed'], note: 'n' },
}

const TIMELINE: TimelineContent = {
  title: 'T',
  start_date: '',
  notes: [],
  rows: [
    { no: '1', activity: 'Kickoff', module: 'Planning', function: '', pic: '', days: 3, parallel: false },
    { no: '2', activity: 'Setup', module: 'Setup', function: '', pic: '', days: 5, parallel: false },
  ],
}

describe('deckVisuals', () => {
  test('produces one visual per replaceable slide, 31–40', () => {
    expect(deckVisuals(SAMPLE_DECK, TIMELINE).map((v) => v.slide)).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39, 40])
  })

  test('skips slide 40 when the project has no Timeline', () => {
    expect(deckVisuals(SAMPLE_DECK, null).map((v) => v.slide)).not.toContain(40)
  })

  test('escapes text so the SVG stays well-formed', () => {
    const arch = deckVisuals(SAMPLE_DECK, null)[0].svg
    expect(arch).toContain('Arch &lt;Klinik &amp; Co&gt;')
    expect(deckVisuals(SAMPLE_DECK, null)[3].svg).toContain('Halo &quot;Bu&quot; Sari')
    for (const v of deckVisuals(SAMPLE_DECK, TIMELINE)) {
      expect(v.svg.startsWith('<svg')).toBe(true)
      expect(v.svg).not.toMatch(/NaN|undefined/)
    }
  })

  test('renders the empty deck without crashing', () => {
    expect(() => deckVisuals(emptyDeck(), { ...TIMELINE, rows: [] })).not.toThrow()
  })
})

describe('deckProblems', () => {
  test('accepts complete content and names what is missing otherwise', () => {
    expect(deckProblems(SAMPLE_DECK)).toBeNull()
    expect(deckProblems({ ...SAMPLE_DECK, mockups: SAMPLE_DECK.mockups.slice(0, 2) })).toBe('Needs 3 mockups')
    expect(deckProblems(emptyDeck())).toBe('Missing architecture stages')
  })
})

describe('wrap', () => {
  test('breaks long text and ellipsizes past the line limit', () => {
    const lines = wrap('satu dua tiga empat lima enam tujuh delapan sembilan sepuluh', 120, 16, { maxLines: 2 })
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })
})
