// Content of the pitch deck's replaceable slides (31–40 of the Cekat template). The AI writes this JSON;
// shared/deck/*.ts turn it into slide visuals and server/deck puts them into the template.

export interface ChatMessage {
  from: 'customer' | 'bot'
  text: string
}

export interface FeatureCard {
  title: string
  description: string
}

export interface MockupSlide {
  /** Top bar, e.g. "MOCKUP AUTOMATION REMINDER". */
  header: string
  /** Slide title, e.g. "Appointment Reminder via WhatsApp". */
  title: string
  /** Name in the phone's chat header, e.g. "Healthcare Assistant AI". */
  botName: string
  chat: ChatMessage[]
  /** Exactly four cards, in reading order: top-left, top-right, bottom-left, bottom-right. */
  cards: FeatureCard[]
}

export interface DeckContent {
  /** Slide 1 — empty presenter fields keep the template's presenter. */
  cover: { title: string; presenter: string; presenterRole: string }
  /** Slide 31 */
  architecture: {
    title: string
    tagline: string
    stages: { title: string; subtitle: string; description: string; bullets: string[] }[]
    integrations: string[]
  }
  /** Slide 32 */
  crmFlow: {
    title: string
    subtitle: string
    steps: { title: string; description: string; items: string[] }[]
    features: { title: string; subtitle: string }[]
    outputs: string[]
  }
  /** Slide 33 */
  marketing: {
    outcome: string
    stages: { title: string; channel: string; actions: string[]; kpi: string }[]
  }
  /** Slides 34–36 */
  mockups: MockupSlide[]
  /** Slide 37 */
  crm: { header: string; title: string; description: string; columns: string[]; rows: string[][] }
  /** Slide 38 */
  kanban: { header: string; title: string; description: string; columns: { name: string; cards: { title: string; meta: string }[] }[] }
  /** Slide 39 */
  analytics: {
    header: string
    title: string
    description: string
    kpis: { label: string; value: string; delta: string }[]
    chartTitle: string
    bars: { label: string; value: number }[]
    breakdownTitle: string
    breakdown: { label: string; value: number }[]
  }
  /** Slide 40 — the Gantt itself comes from the project's Timeline document. */
  timeline: { prerequisites: string[]; note: string }
}

// ---------- JSON schema for structured output ----------

type Schema = Record<string, unknown>
const str = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) })
const num = (description?: string): Schema => ({ type: 'number', ...(description ? { description } : {}) })
const arr = (items: Schema, description?: string): Schema => ({ type: 'array', items, ...(description ? { description } : {}) })
const obj = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

const card = obj({ title: str('3–6 words'), description: str('1–2 short sentences, max ~140 characters') })

const mockup = obj({
  header: str('Top bar in caps, e.g. "MOCKUP AUTOMATION REMINDER"'),
  title: str('Use case title, e.g. "Appointment Reminder via WhatsApp"'),
  botName: str('Chat header name, e.g. "Healthcare Assistant AI"'),
  chat: arr(obj({ from: { type: 'string', enum: ['customer', 'bot'] }, text: str('One chat bubble, max ~160 characters') }), '4–7 bubbles showing the use case end to end'),
  cards: arr(card, 'Exactly 4 benefit/feature cards'),
})

export const DECK_SCHEMA: Schema = obj({
  cover: obj({
    title: str('Cover headline for this client, max ~110 characters, e.g. "Scaling Klinik X Excellence: Elevating Patient Care through Intelligent AI Automation"'),
    presenter: str('Presenter name — leave empty unless the SA gave it'),
    presenterRole: str('Presenter job title — leave empty unless the SA gave it'),
  }),
  architecture: obj({
    title: str('Infographic title, e.g. "CEKAT.AI End-to-End Patient Journey Architecture"'),
    tagline: str('One quotable sentence for under the diagram (in quotes style), max ~220 characters'),
    stages: arr(
      obj({ title: str('Stage name, 2–4 words'), subtitle: str('Short qualifier in parentheses style'), description: str('One sentence'), bullets: arr(str('max ~50 characters'), '2–4 bullets') }),
      '6–8 stages from first contact to post-care / retention',
    ),
    integrations: arr(str('System name, e.g. "HIS / HMIS", "EMR", "Payment Gateway"'), '4–7 integration systems for the bottom integration layer'),
  }),
  crmFlow: obj({
    title: str('e.g. "HEALTHCARE CRM - ALUR DATA & FITUR"'),
    subtitle: str('One line'),
    steps: arr(obj({ title: str('2–5 words'), description: str('One sentence'), items: arr(str('max ~40 characters'), '3–5 items') }), 'Exactly 5 steps of the data flow'),
    features: arr(obj({ title: str('Feature, 2–4 words'), subtitle: str('Short qualifier') }), '6–8 CRM features'),
    outputs: arr(str('Outcome, 3–6 words'), '4–5 main outcomes'),
  }),
  marketing: obj({
    outcome: str('One sentence on the business result of the journey, max ~200 characters'),
    stages: arr(obj({ title: str('Stage, e.g. Awareness'), channel: str('Main channel/touchpoint'), actions: arr(str('max ~45 characters'), '2–4 automated actions'), kpi: str('KPI for this stage') }), 'Exactly 5 journey stages'),
  }),
  mockups: arr(mockup, 'Exactly 3 WhatsApp use-case mockups relevant to this client'),
  crm: obj({
    header: str('Top bar in caps, e.g. "MOCKUP CRM"'),
    title: str('e.g. "Centralized Patient CRM for Intake & Follow-up"'),
    description: str('2 sentences on the value, max ~260 characters'),
    columns: arr(str(), '5–6 column names of the CRM table'),
    rows: arr(arr(str()), '6–8 realistic sample rows (fake names), one value per column'),
  }),
  kanban: obj({
    header: str('Top bar in caps, e.g. "MOCKUP KANBAN"'),
    title: str(),
    description: str('2 sentences, max ~260 characters'),
    columns: arr(obj({ name: str('Stage'), cards: arr(obj({ title: str('Ticket/deal name'), meta: str('e.g. owner · due date · tag') }), '1–3 cards') }), 'Exactly 4 columns'),
  }),
  analytics: obj({
    header: str('Top bar in caps, e.g. "MOCKUP ANALYTICS"'),
    title: str(),
    description: str('What the dashboard shows and why it matters, max ~300 characters'),
    kpis: arr(obj({ label: str(), value: str('Formatted, e.g. "1,284" or "92%"'), delta: str('e.g. "+12% vs last month"') }), 'Exactly 4 KPIs'),
    chartTitle: str(),
    bars: arr(obj({ label: str('Short label'), value: num() }), '5–7 bars'),
    breakdownTitle: str(),
    breakdown: arr(obj({ label: str(), value: num('Share, any scale') }), '3–5 slices'),
  }),
  timeline: obj({
    prerequisites: arr(str('e.g. "SOW Signed", "API Documentation"'), '4–6 prerequisites before the timeline starts'),
    note: str('Important note/assumption about the timeline, max ~260 characters'),
  }),
})

// ---------- light runtime validation (structured outputs already enforce the shape) ----------

export function deckProblems(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Content is not an object'
  const d = value as Partial<DeckContent>
  if (!d.architecture?.stages?.length) return 'Missing architecture stages'
  if (!d.crmFlow?.steps?.length) return 'Missing CRM flow steps'
  if (!d.marketing?.stages?.length) return 'Missing marketing stages'
  if (!Array.isArray(d.mockups) || d.mockups.length < 3) return 'Needs 3 mockups'
  if (d.mockups.some((m) => !Array.isArray(m.cards) || m.cards.length < 4)) return 'Each mockup needs 4 cards'
  if (!d.crm?.columns?.length) return 'Missing CRM columns'
  if (!d.kanban?.columns?.length) return 'Missing kanban columns'
  if (!d.analytics?.kpis?.length) return 'Missing analytics KPIs'
  if (!d.timeline) return 'Missing timeline notes'
  return null
}

export function emptyDeck(): DeckContent {
  const cards = Array.from({ length: 4 }, () => ({ title: '', description: '' }))
  const mock = (header: string): MockupSlide => ({ header, title: '', botName: 'AI Assistant', chat: [], cards })
  return {
    cover: { title: '', presenter: '', presenterRole: '' },
    architecture: { title: '', tagline: '', stages: [], integrations: [] },
    crmFlow: { title: '', subtitle: '', steps: [], features: [], outputs: [] },
    marketing: { outcome: '', stages: [] },
    mockups: [mock('MOCKUP AUTOMATION'), mock('MOCKUP AUTOMATION'), mock('MOCKUP AUTOMATION')],
    crm: { header: 'MOCKUP CRM', title: '', description: '', columns: [], rows: [] },
    kanban: { header: 'MOCKUP KANBAN', title: '', description: '', columns: [] },
    analytics: { header: 'MOCKUP ANALYTICS', title: '', description: '', kpis: [], chartTitle: '', bars: [], breakdownTitle: '', breakdown: [] },
    timeline: { prerequisites: [], note: '' },
  }
}
