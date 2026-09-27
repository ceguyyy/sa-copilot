// Single source of truth for document types and their JSON schemas.
// Imported by the Deno edge function AND the Vite frontend, so it must stay
// dependency-free plain TypeScript.

export const DOC_TYPES = [
  'assessment',
  'tor',
  'timeline',
  'sow_cekat',
  'sow_cif',
  'onboarding',
  'diagram',
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
  diagram: 'Diagram',
}

/** Pipeline order shown on the project overview. Diagrams are free-floating. */
export const PIPELINE: DocType[] = ['assessment', 'tor', 'timeline', 'sow_cekat', 'sow_cif', 'onboarding']

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
  diagram: DiagramContent
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
      return Array.isArray(c.meta) && Array.isArray(c.sections) ? null : 'Missing meta[] or sections[]'
    case 'onboarding':
      return Array.isArray(c.sections) ? null : 'Missing sections[]'
    case 'diagram':
      return typeof c.mermaid === 'string' && c.mermaid.trim() ? null : 'Missing mermaid source'
  }
}

export function emptyContent<T extends DocType>(type: T): DocContentMap[T] {
  const empty: DocContentMap = {
    assessment: { language: 'id', summary: '', rows: [] },
    tor: { rows: [] },
    timeline: { title: 'Timeline Setup, Development, & Maintenance', start_date: '', rows: [], notes: [] },
    sow_cekat: { meta: [], sections: [] },
    sow_cif: { meta: [], sections: [] },
    onboarding: { title: 'Onboarding Form', sections: [] },
    diagram: { kind: 'activity', title: 'New diagram', mermaid: 'flowchart TD\n  A[Start] --> B[End]', explanation: '' },
  }
  return empty[type]
}
