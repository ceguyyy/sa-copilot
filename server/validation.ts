// Request body schemas. Zod strips unknown keys, so parsed objects only ever contain writable columns.
import { z } from 'zod'
import { DOC_TYPES, SKILL_OUTPUT_TYPES } from '../shared/schemas.ts'
import { HttpError, UUID_RE } from './http.ts'

const uuid = z.string().regex(UUID_RE, 'Invalid id')
const optionalText = z.string().max(20_000).nullable().optional()

export const projectInput = z.object({
  name: z.string().trim().min(1).max(200),
  client_name: z.string().trim().min(1).max(200),
  industry: optionalText,
  package: optionalText,
  status: z.enum(['discovery', 'assessment', 'proposal', 'won', 'lost', 'delivery']).optional(),
  description: optionalText,
  language: z.string().trim().min(1).max(40).optional(),
})
export const projectPatch = projectInput.partial()

const skillFields = z.object({
  name: z.string().trim().min(1).max(120),
  output_type: z.enum(SKILL_OUTPUT_TYPES),
  description: z.string().max(2_000),
  instructions: z.string().min(1).max(200_000),
  is_default: z.boolean(),
})
export const skillInput = skillFields.extend({
  description: skillFields.shape.description.default(''),
  is_default: skillFields.shape.is_default.default(false),
})
// Built from the default-free fields so a PATCH never resets columns it did not mention.
export const skillPatch = skillFields.partial()
export const skillBulk = z.array(skillInput).max(200)

export const sourceText = z.object({
  projectId: uuid.nullable(),
  kind: z.enum(['requirement', 'knowledge']),
  name: z.string().trim().min(1).max(300),
  text: z.string().max(5_000_000),
})

export const sourceUploadFields = z.object({
  projectId: uuid.nullable(),
  kind: z.enum(['requirement', 'knowledge']),
  extractedText: z.string().max(5_000_000),
})

const docContent = z.record(z.string(), z.unknown())

export const sourcePatch = z.object({ enabled: z.boolean() })

export const documentInput = z.object({
  projectId: uuid,
  type: z.enum(DOC_TYPES),
  title: z.string().trim().min(1).max(300),
  content: docContent,
  templateId: uuid.nullable().optional(),
})

export const documentPatch = z
  .object({ title: z.string().trim().min(1).max(300), is_knowledge: z.boolean() })
  .partial()
  .refine((p) => p.title !== undefined || p.is_knowledge !== undefined, 'Nothing to update')

export const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2_000).default(''),
  instructions: z.string().max(100_000).default(''),
})
export const templatePatch = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2_000),
  instructions: z.string().max(100_000),
}).partial()

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u) && URL.canParse(u), 'Must be an http(s) URL')

export const mcpServerInput = z.object({ name: z.string().trim().min(1).max(80), url: httpUrl })
export const mcpServerPatch = z.object({ name: z.string().trim().min(1).max(80), url: httpUrl, enabled: z.boolean() }).partial()

export const versionInput = z.object({
  content: docContent,
  origin: z.enum(['manual', 'restore']),
  note: z.string().max(2_000).default(''),
})

/** Builds `col = $n` assignments for an UPDATE from an already-validated patch object. */
export function toSetClause(patch: Record<string, unknown>, firstIndex = 1): { sql: string; values: unknown[] } {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
  if (!entries.length) throw new HttpError(400, 'Nothing to update')
  return {
    sql: entries.map(([k], i) => `"${k}" = $${firstIndex + i}`).join(', '),
    values: entries.map(([, v]) => v),
  }
}
