// Every replaceable visual of the deck, as SVG, with the slide it belongs to and its pixel size.
import type { TimelineContent } from '../schemas.ts'
import { architectureSvg, crmFlowSvg, marketingSvg } from './diagrams.ts'
import { analyticsSvg, crmTableSvg, kanbanSvg, phoneSvg } from './mockups.ts'
import { timelineSvg } from './timeline.ts'
import type { DeckContent } from './types.ts'

export * from './types.ts'

export interface DeckVisual {
  /** 1-based slide number in the template. */
  slide: number
  key: string
  label: string
  svg: string
}

export function deckVisuals(deck: DeckContent, timeline: TimelineContent | null): DeckVisual[] {
  const visuals: DeckVisual[] = [
    { slide: 31, key: 'architecture', label: 'End-to-end architecture', svg: architectureSvg(deck.architecture) },
    { slide: 32, key: 'crmFlow', label: 'Alur data di CRM', svg: crmFlowSvg(deck.crmFlow) },
    { slide: 33, key: 'marketing', label: 'Marketing journey', svg: marketingSvg(deck.marketing) },
    ...deck.mockups.slice(0, 3).map((m, i) => ({ slide: 34 + i, key: `mockup${i + 1}`, label: `Mockup use case ${i + 1}`, svg: phoneSvg(m) })),
    { slide: 37, key: 'crm', label: 'Mockup CRM', svg: crmTableSvg(deck.crm) },
    { slide: 38, key: 'kanban', label: 'Mockup kanban', svg: kanbanSvg(deck.kanban) },
    { slide: 39, key: 'analytics', label: 'Mockup analytics', svg: analyticsSvg(deck.analytics) },
  ]
  if (timeline) visuals.push({ slide: 40, key: 'timeline', label: 'Timeline', svg: timelineSvg(timeline, deck.timeline) })
  return visuals
}
