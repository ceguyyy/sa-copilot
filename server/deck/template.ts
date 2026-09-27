// Where each part of DeckContent goes in "Deck Cekat.ai Healthcare 2026.pptx" (slide 1 and slides 31–40).
// Shape names come from the template (exported from Google Slides as "Google Shape;<id>;p<page>");
// build_deck.py fails loudly if a name is missing, e.g. when a different template is configured.
import type { DeckContent, DeckVisual, MockupSlide } from '../../shared/deck/index.ts'

export interface SlideEdit {
  index: number
  /** A string replaces the box's text; a list sets it paragraph by paragraph (null keeps a paragraph). */
  texts: Record<string, string | (string | null)[]>
  images: Record<string, { visual: string; box?: [number, number, number, number] }>
}

/** Google Slides page ids are offset by 15 from the slide number in this template. */
const shape = (id: number, slide: number) => `Google Shape;${id};p${slide + 15}`

/** Card text shape ids per mockup slide, in reading order TL, TR, BL, BR: [title, description]. */
const MOCKUP_CARDS: Record<number, { header: number; title: number; picture: number; cards: [number, number][] }> = {
  34: { header: 549, title: 547, picture: 558, cards: [[552, 553], [554, 557], [550, 551], [555, 556]] },
  35: { header: 566, title: 564, picture: 581, cards: [[573, 574], [576, 577], [570, 571], [579, 580]] },
  36: { header: 589, title: 587, picture: 604, cards: [[596, 597], [599, 600], [593, 594], [602, 603]] },
}

function mockupSlide(slide: number, m: MockupSlide, visualKey: string): SlideEdit {
  const ids = MOCKUP_CARDS[slide]
  const texts: Record<string, string> = { [shape(ids.header, slide)]: m.header, [shape(ids.title, slide)]: m.title }
  ids.cards.forEach(([titleId, descId], i) => {
    const card = m.cards[i]
    if (!card) return
    texts[shape(titleId, slide)] = card.title
    texts[shape(descId, slide)] = card.description
  })
  return { index: slide, texts, images: { [shape(ids.picture, slide)]: { visual: visualKey } } }
}

export function templateEdits(deck: DeckContent, visuals: DeckVisual[]): SlideEdit[] {
  const has = (key: string) => visuals.some((v) => v.key === key)
  const cover = deck.cover ?? { title: '', presenter: '', presenterRole: '' }
  const edits: SlideEdit[] = [
    {
      index: 1,
      texts: {
        [shape(59, 1)]: cover.title,
        // Two paragraphs: name, then job title. Empty ones keep the template's wording.
        [shape(60, 1)]: [cover.presenter.trim() || null, cover.presenterRole.trim() || null],
      },
      images: {},
    },
    { index: 31, texts: { [shape(527, 31)]: deck.architecture.tagline }, images: { [shape(529, 31)]: { visual: 'architecture' } } },
    { index: 32, texts: {}, images: { [shape(534, 32)]: { visual: 'crmFlow' } } },
    { index: 33, texts: { [shape(539, 33)]: deck.marketing.outcome }, images: { [shape(541, 33)]: { visual: 'marketing' } } },
    ...deck.mockups.slice(0, 3).map((m, i) => mockupSlide(34 + i, m, `mockup${i + 1}`)),
    {
      index: 37,
      texts: { [shape(613, 37)]: deck.crm.header, [shape(611, 37)]: deck.crm.title, [shape(615, 37)]: deck.crm.description },
      images: { [shape(610, 37)]: { visual: 'crm' } },
    },
    {
      index: 38,
      texts: { [shape(624, 38)]: deck.kanban.header, [shape(622, 38)]: deck.kanban.title, [shape(626, 38)]: deck.kanban.description },
      // The original picture runs under the description box; keep the new one above it.
      images: { [shape(621, 38)]: { visual: 'kanban', box: [0.55, 1.08, 8.9, 3.15] } },
    },
    {
      index: 39,
      texts: { [shape(634, 39)]: deck.analytics.header, [shape(632, 39)]: deck.analytics.title, [shape(636, 39)]: deck.analytics.description },
      images: { [shape(637, 39)]: { visual: 'analytics' } },
    },
  ]
  if (has('timeline')) edits.push({ index: 40, texts: {}, images: { [shape(642, 40)]: { visual: 'timeline' } } })
  // Drop empty strings so an unfinished field keeps the template's text instead of blanking it.
  const filled = (v: string | (string | null)[]) => (Array.isArray(v) ? v.some((p) => p !== null) : !!v?.trim())
  return edits.map((e) => ({ ...e, texts: Object.fromEntries(Object.entries(e.texts).filter(([, v]) => filled(v))) }))
}
