// Single source of truth for document types and their JSON schemas.
// Imported by the Deno edge function AND the Vite frontend, so it must stay
// dependency-free plain TypeScript (shared/deck/types.ts follows the same rule).

import { DECK_SCHEMA, deckProblems, emptyDeck, type DeckContent } from './deck/types.ts'

export const DOC_TYPES = [
  'assessment',
  'tor',
  'timeline',
  'sow_cekat',
  'sow_cif',
  'onboarding',
  'user_journey',
  'diagram',
  'custom',
  'deck',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export const SKILL_OUTPUT_TYPES = [...DOC_TYPES, 'chat'] as const
export type SkillOutputType = (typeof SKILL_OUTPUT_TYPES)[number]

export const DOC_LABELS: Record<DocType, string> = {
  assessment: 'Assessment Requirement',
  tor: 'TOR',
  timeline: 'Timeline',
  sow_cekat: 'SOW — Cekat',
  sow_cif: 'SOW — CIF Meta',
  onboarding: 'Onboarding Form',
  user_journey: 'User Journey',
  diagram: 'Diagram',
  custom: 'Custom deliverable',
  deck: 'Pitch deck (PPTX)',
}

/** Pipeline order shown on the project overview. Diagrams are free-floating. */
export const PIPELINE: DocType[] = ['assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding', 'user_journey', 'deck']

export const DIAGRAM_KINDS = [
  'activity',
  'sequence',
  'flowchart',
  'state',
  'class',
  'er',
  'journey',
  'gantt',
] as const
export type DiagramKind = (typeof DIAGRAM_KINDS)[number]

// ---------- Content types ----------

export type AssessmentStatus = 'answered' | 'needs_confirmation' | 'not_applicable'

export interface AssessmentContent {
  language: 'id' | 'en'
  summary: string
  rows: { no: number; topic: string; question: string; feedback: string; status: AssessmentStatus }[]
}

export interface TorContent {
  rows: { layanan: string; sub_layanan: string; deskripsi: string; note: string; raised_by: string }[]
}

export interface TimelineRow {
  no: string
  activity: string
  module: string
  function: string
  pic: string
  days: number
  /** When true the row starts together with the previous row instead of after it. */
  parallel: boolean
}

export interface TimelineContent {
  title: string
  start_date: string
  rows: TimelineRow[]
  notes: string[]
}

export interface SowContent {
  meta: { key: string; value: string }[]
  sections: { title: string; markdown: string }[]
}

export type OnboardingFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'file'

export interface OnboardingContent {
  title: string
  sections: {
    title: string
    description: string
    fields: {
      label: string
      type: OnboardingFieldType
      required: boolean
      options: string[]
      help: string
      value: string
    }[]
  }[]
}

/** One scripted AI Agent turn (a row of the Cekat "Template User Journey Workflows" sheet). */
export interface UserJourneyScript {
  /** Script number within the sheet ("1", "2", …). */
  no: string
  /** "root" (session start), "random" (reachable from any state) or the parent script number. */
  parent: string
  scenario: string
  /** Sample user input or the condition the system reads, e.g. "halo", "[no resi]". */
  trigger: string
  /** What the AI Agent replies; dynamic API data as [variable], buttons as "[button] Label". */
  response: string
  /** API (GET/POST), validation, labels, routing, connect agent… */
  note: string
  revision: string
}

/** A titled group of scripts inside a sheet (the blue section rows, e.g. "Greeting", "Main Menu"). */
export interface UserJourneySection {
  title: string
  scripts: UserJourneyScript[]
}

/** One topic sheet (e.g. "Greeting, Main Menu", "Tracking Paket", "Unknown, CSAT, Live Agent", FAQ). */
export interface UserJourneySheet {
  name: string
  sections: UserJourneySection[]
}

export interface UserJourneyContent {
  title: string
  /** AI Agent persona name, used in the greeting. */
  persona: string
  sheets: UserJourneySheet[]
}

export interface DiagramContent {
  kind: DiagramKind
  title: string
  mermaid: string
  explanation: string
}

export interface DocContentMap {
  assessment: AssessmentContent
  tor: TorContent
  timeline: TimelineContent
  sow_cekat: SowContent
  sow_cif: SowContent
  onboarding: OnboardingContent
  user_journey: UserJourneyContent
  diagram: DiagramContent
  /** User-defined deliverable (see doc_templates): same shape as a SOW. */
  custom: SowContent
  /** Pitch deck: slides 31–40 of the PPTX template (see shared/deck). */
  deck: DeckContent
}

export type AnyDocContent = DocContentMap[DocType]

// ---------- JSON Schemas (structured outputs: every object closed, every key required) ----------

type JsonSchema = Record<string, unknown>

const str = { type: 'string' }
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})
const arr = (items: JsonSchema): JsonSchema => ({ type: 'array', items })

const sowSchema = obj({
  meta: arr(obj({ key: str, value: str })),
  sections: arr(obj({ title: str, markdown: str })),
})

export const DOC_SCHEMAS: Record<DocType, JsonSchema> = {
  assessment: obj({
    language: { type: 'string', enum: ['id', 'en'] },
    summary: str,
    rows: arr(
      obj({
        no: { type: 'integer' },
        topic: str,
        question: str,
        feedback: str,
        status: { type: 'string', enum: ['answered', 'needs_confirmation', 'not_applicable'] },
      }),
    ),
  }),
  tor: obj({
    rows: arr(obj({ layanan: str, sub_layanan: str, deskripsi: str, note: str, raised_by: str })),
  }),
  timeline: obj({
    title: str,
    start_date: { type: 'string', description: 'ISO date YYYY-MM-DD, or empty string if unknown' },
    rows: arr(
      obj({
        no: str,
        activity: str,
        module: str,
        function: str,
        pic: str,
        days: { type: 'number' },
        parallel: { type: 'boolean' },
      }),
    ),
    notes: arr(str),
  }),
  sow_cekat: sowSchema,
  sow_cif: sowSchema,
  custom: sowSchema,
  deck: DECK_SCHEMA,
  onboarding: obj({
    title: str,
    sections: arr(
      obj({
        title: str,
        description: str,
        fields: arr(
          obj({
            label: str,
            type: { type: 'string', enum: ['text', 'textarea', 'select', 'checkbox', 'date', 'file'] },
            required: { type: 'boolean' },
            options: arr(str),
            help: str,
            value: str,
          }),
        ),
      }),
    ),
  }),
  user_journey: obj({
    title: str,
    persona: { type: 'string', description: 'AI Agent persona name, e.g. "Clara"' },
    sheets: arr(
      obj({
        name: { type: 'string', description: 'Topic sheet name, max 31 characters, e.g. "Greeting, Main Menu"' },
        sections: arr(
          obj({
            title: str,
            scripts: arr(
              obj({
                no: str,
                parent: { type: 'string', description: '"root", "random" or the parent script number' },
                scenario: str,
                trigger: str,
                response: str,
                note: str,
                revision: str,
              }),
            ),
          }),
        ),
      }),
    ),
  }),
  diagram: obj({
    kind: { type: 'string', enum: [...DIAGRAM_KINDS] },
    title: str,
    mermaid: { type: 'string', description: 'Valid Mermaid source only, no ``` fences' },
    explanation: str,
  }),
}

export function isDocType(value: unknown): value is DocType {
  return typeof value === 'string' && (DOC_TYPES as readonly string[]).includes(value)
}

/** Minimal runtime shape check shared by edge function and UI (structured outputs already enforce the schema). */
export function validateContent(type: DocType, content: unknown): string | null {
  if (!content || typeof content !== 'object') return 'Content is not an object'
  const c = content as Record<string, unknown>
  switch (type) {
    case 'assessment':
    case 'tor':
      return Array.isArray(c.rows) ? null : 'Missing rows[]'
    case 'timeline':
      return Array.isArray(c.rows) && Array.isArray(c.notes) ? null : 'Missing rows[] or notes[]'
    case 'sow_cekat':
    case 'sow_cif':
    case 'custom':
      return Array.isArray(c.meta) && Array.isArray(c.sections) ? null : 'Missing meta[] or sections[]'
    case 'onboarding':
      return Array.isArray(c.sections) ? null : 'Missing sections[]'
    case 'user_journey':
      return Array.isArray(c.sheets) ? null : 'Missing sheets[]'
    case 'diagram':
      return typeof c.mermaid === 'string' && c.mermaid.trim() ? null : 'Missing mermaid source'
    case 'deck':
      return deckProblems(c)
  }
}

export function emptyContent<T extends DocType>(type: T): DocContentMap[T] {
  const empty: DocContentMap = {
    assessment: { language: 'id', summary: '', rows: [] },
    tor: { rows: [] },
    timeline: { title: 'Timeline Setup, Development, & Maintenance', start_date: '', rows: [], notes: [] },
    sow_cekat: { meta: [], sections: [] },
    sow_cif: { meta: [], sections: [] },
    custom: { meta: [], sections: [] },
    deck: emptyDeck(),
    onboarding: { title: 'Onboarding Form', sections: [] },
    user_journey: { title: 'User Journey AI Agent Workflow', persona: '', sheets: [] },
    diagram: { kind: 'activity', title: 'New diagram', mermaid: 'flowchart TD\n  A[Start] --> B[End]', explanation: '' },
  }
  return empty[type]
}
