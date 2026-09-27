// Readable outline of the deck's generated slides (for preview, diff and the .md export).
import type { DeckContent } from './types.ts'

export function deckMarkdown(d: DeckContent): string {
  const parts = ['_Pitch deck — slide 1 and slides 31–40 of the PPTX template. Download the .pptx for the full deck._']
  if (d.cover) parts.push(`## 1 · ${d.cover.title}\n\n${[d.cover.presenter, d.cover.presenterRole].filter(Boolean).join(' — ')}`)
  parts.push(
    `## 31 · ${d.architecture.title}\n\n> ${d.architecture.tagline}\n\n${d.architecture.stages.map((s, i) => `${i + 1}. **${s.title}** — ${s.description}`).join('\n')}\n\nIntegrations: ${d.architecture.integrations.join(', ')}`,
  )
  parts.push(`## 32 · ${d.crmFlow.title}\n\n${d.crmFlow.steps.map((s, i) => `${i + 1}. **${s.title}** — ${s.description}`).join('\n')}`)
  parts.push(`## 33 · Marketing journey\n\n${d.marketing.stages.map((s) => `- **${s.title}** (${s.channel}) — KPI: ${s.kpi}`).join('\n')}\n\n${d.marketing.outcome}`)
  d.mockups.forEach((m, i) => {
    const chat = m.chat.map((c) => `- _${c.from}_: ${c.text}`).join('\n')
    const cards = m.cards.map((c) => `- **${c.title}** — ${c.description}`).join('\n')
    parts.push(`## ${34 + i} · ${m.title}\n\n${chat}\n\n${cards}`)
  })
  parts.push(`## 37 · ${d.crm.title}\n\n${d.crm.description}`)
  parts.push(`## 38 · ${d.kanban.title}\n\n${d.kanban.description}`)
  parts.push(`## 39 · ${d.analytics.title}\n\n${d.analytics.description}`)
  parts.push(`## 40 · Timeline\n\nPrasyarat: ${d.timeline.prerequisites.join(', ')}\n\n${d.timeline.note}`)
  return parts.join('\n\n')
}
