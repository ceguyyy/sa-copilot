// Request body schemas. Zod strips unknown keys, so parsed objects only ever contain writable columns.
import { z } from 'zod'
import { CRM_COLUMN_TYPES, normalizeCrm } from '../shared/pocCrm.ts'
import { isValidWelcomeImage } from '../shared/pocImage.ts'
import { POC_LABEL_MAX_CHARS } from '../shared/pocLimits.ts'
import { type LegacyWorkflow, workflowCases } from '../shared/pocN8n.ts'
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
  // Blank = not chosen in the form; the main language from Settings is used for new projects.
  language: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? undefined : v), z.string().trim().min(1).max(40).optional()),
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

export const sourceScrape = z.object({
  projectId: uuid.nullable(),
  url: z.string().trim().min(1).max(2_000)
    .refine((value) => /^https?:\/\//i.test(value) && URL.canParse(value), 'Must be an http(s) URL'),
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

const optionalHttpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u.length === 0 || (/^https?:\/\//i.test(u) && URL.canParse(u)), 'Must be an http(s) URL or blank')

const pocApiMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const blankableText = (max: number) => z.string().trim().max(max)
const pocKnowledgeBase = z.object({
  textSections: z.array(z.object({ title: blankableText(200), content: z.string().max(50_000).default('') })).default([]),
  websites: z.array(z.object({ url: optionalHttpUrl, note: z.string().max(2_000).default('') })).default([]),
  qna: z.array(z.object({ question: blankableText(500), answer: z.string().max(20_000).default('') })).default([]),
  files: z.array(z.object({ name: blankableText(200), size: z.number().int().min(0).default(0) })).default([]),
})

const pocKnowledgeBasePatch = pocKnowledgeBase.partial()

const pocPipeline = z.array(
  z.object({
    order: z.number().int().min(1),
    status: z.string().trim().max(120).default(''),
    condition: z.string().max(2_000).default(''),
  }),
).default([])

// Cekat CRM boards (typed columns + sample items, kanban grouped by a Select/Dropdown column). Legacy
// stage-only boards are converted by normalizeCrm before validation.
const pocCrmColumn = z.object({
  key: z.string().trim().min(1).max(20),
  name: z.string().trim().max(120),
  type: z.enum(CRM_COLUMN_TYPES),
  options: z.array(z.object({ label: z.string().trim().max(80), condition: z.string().max(2_000) })).max(50),
})
const pocCrm = z.preprocess(
  normalizeCrm,
  z.object({
    boards: z
      .array(
        z.object({
          name: z.string().trim().max(120),
          description: z.string().max(2_000),
          columns: z.array(pocCrmColumn).max(40),
          rows: z.array(z.record(z.string(), z.string().max(5_000))).max(100),
          kanbanColumn: z.string().max(20),
        }),
      )
      .max(30),
  }),
)

// Complete n8n workflows (JSON kept as text so it can be edited) with one cURL per use case (action) to test it.
const pocN8nCase = z.object({
  action: z.string().trim().max(120).default(''),
  title: z.string().max(500).default(''),
  curl: z.string().max(20_000),
})
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
/** Workflows saved before use cases existed keep their single cURL as one use case. */
const upgradeLegacyN8n = (v: unknown) =>
  isRecord(v) && Array.isArray(v.workflows)
    ? { ...v, workflows: v.workflows.map((w) => (isRecord(w) && !('cases' in w) ? { ...w, cases: workflowCases(w as LegacyWorkflow) } : w)) }
    : v
const pocN8n = z.preprocess(upgradeLegacyN8n, z.object({
  workflows: z
    .array(
      z.object({
        name: z.string().trim().max(200),
        description: z.string().max(5_000).default(''),
        json: z.string().max(500_000),
        cases: z.array(pocN8nCase).max(50).default([]),
        testNotes: z.string().max(5_000).default(''),
      }),
    )
    .max(30)
    .default([]),
}))

// Conversation flowchart (Mermaid) and happy cases to try the agent in Cekat.
const pocFlow = z.object({
  mermaid: z.string().max(50_000).default(''),
  happyCases: z
    .array(
      z.object({
        title: z.string().trim().max(200),
        goal: z.string().max(2_000).default(''),
        steps: z.array(z.object({ user: z.string().max(5_000), ai: z.string().max(5_000), action: z.string().max(2_000) })).max(40),
      }),
    )
    .max(20)
    .default([]),
})

// A link, or an image picked from disk embedded as a data URL (max 2 MB). Short legacy values stay accepted.
const MAX_LEGACY_IMAGE_CHARS = 500
const welcomeImage = z
  .string()
  .max(3_000_000)
  .refine(
    (v) => isValidWelcomeImage(v) || (v.length <= MAX_LEGACY_IMAGE_CHARS && !v.startsWith('data:')),
    'Welcome image must be a link or a PNG, JPEG, GIF or WebP image up to 2 MB',
  )

const pocApiIntegration = z.object({
  name: z.string().trim().max(64).refine((v) => v === '' || /^[a-z][a-z0-9_]{0,63}$/.test(v), 'Must be a valid API name or blank'),
  httpMethod: pocApiMethod,
  description: z.string().max(5_000).default(''),
  webhookAddress: z.string().trim().max(500).default(''),
  apiKey: z.string().max(500).optional().or(z.literal('')),
  aiInput: z.record(z.string(), z.unknown()).default({}),
  // What the n8n workflow behind the Cekat webhook calls: the client's endpoint, and its login endpoint if any.
  targetMethod: pocApiMethod.default('GET'),
  targetUrl: z.string().trim().max(1_000).default(''),
  authUrl: z.string().trim().max(1_000).default(''),
})

export const pocConfig = z.object({
  agentBehavior: z.string().max(200_000).default(''),
  welcomeMessage: z.string().max(5_000).default(''),
  welcomeImage: welcomeImage.nullable().optional(),
  agentTransferConditions: z.string().max(5_000).default(''),
  stopAiAfterHandoff: z.boolean().default(false),
  silentAgentHandoff: z.boolean().default(false),
  labels: z.array(z.object({ name: z.string().trim().max(POC_LABEL_MAX_CHARS).default(''), condition: z.string().max(POC_LABEL_MAX_CHARS).default('') })).default([]),
  pipeline: pocPipeline,
  knowledgeBase: pocKnowledgeBase.default({
    textSections: [],
    websites: [],
    qna: [],
    files: [],
  } as const),
  apiIntegrations: z.array(pocApiIntegration).default([]),
  crm: pocCrm.default({ boards: [] }),
  flow: pocFlow.default({ mermaid: '', happyCases: [] }),
  n8n: pocN8n.default({ workflows: [] }),
  additionalSettings: z
    .object({
      aiHistoryLimit: z.number().int().min(0).default(20),
      aiReadFileLimit: z.number().int().min(0).default(3),
      aiContextLimit: z.number().int().min(0).default(10),
      aiTemperature: z.enum(['low', 'balanced', 'creative']).default('balanced'),
      messageAwait: z.number().int().min(0).default(5),
      aiMessageLimit: z.number().int().min(0).default(1000),
      watcher: z.enum(['off', 'standard', 'strict']).default('off'),
      timezone: z.string().trim().min(1).max(80).default('(GMT+7:00) Bangkok, Hanoi, Jakarta'),
      sessionOnlyMemory: z.enum(['off', 'session_only', 'per_thread']).default('off'),
      ignoreTeamHandoff: z.boolean().default(false),
    })
    .default({
      aiHistoryLimit: 20,
      aiReadFileLimit: 3,
      aiContextLimit: 10,
      aiTemperature: 'balanced',
      messageAwait: 5,
      aiMessageLimit: 1000,
      watcher: 'off',
      timezone: '(GMT+7:00) Bangkok, Hanoi, Jakarta',
      sessionOnlyMemory: 'off',
      ignoreTeamHandoff: false,
    } as const),
})

const pocConfigPatch = pocConfig.partial().extend({
  knowledgeBase: pocKnowledgeBasePatch.optional(),
  labels: z.array(z.object({ name: z.string().trim().max(POC_LABEL_MAX_CHARS).optional(), condition: z.string().max(POC_LABEL_MAX_CHARS).default('').optional() }).partial()).optional(),
  pipeline: z.array(z.object({ order: z.number().int().min(1).optional(), status: z.string().trim().max(120).optional(), condition: z.string().max(2_000).default('').optional() }).partial()).optional(),
  apiIntegrations: z.array(pocApiIntegration.partial()).optional(),
  additionalSettings: z.object({
    aiHistoryLimit: z.number().int().min(0).optional(),
    aiReadFileLimit: z.number().int().min(0).optional(),
    aiContextLimit: z.number().int().min(0).optional(),
    aiTemperature: z.enum(['low', 'balanced', 'creative']).optional(),
    messageAwait: z.number().int().min(0).optional(),
    aiMessageLimit: z.number().int().min(0).optional(),
    watcher: z.enum(['off', 'standard', 'strict']).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    sessionOnlyMemory: z.enum(['off', 'session_only', 'per_thread']).optional(),
    ignoreTeamHandoff: z.boolean().optional(),
  }).partial().optional(),
})

export const pocInput = z.object({
  projectId: uuid,
  name: z.string().trim().min(1).max(120),
  config: pocConfig.default({
    agentBehavior: '',
    welcomeMessage: '',
    welcomeImage: null,
    agentTransferConditions: '',
    stopAiAfterHandoff: false,
    silentAgentHandoff: false,
    labels: [],
    pipeline: [],
    knowledgeBase: {
      textSections: [],
      websites: [],
      qna: [],
      files: [],
    },
    apiIntegrations: [],
    crm: { boards: [] },
    flow: { mermaid: '', happyCases: [] },
    n8n: { workflows: [] },
    additionalSettings: {
      aiHistoryLimit: 20,
      aiReadFileLimit: 3,
      aiContextLimit: 10,
      aiTemperature: 'balanced',
      messageAwait: 5,
      aiMessageLimit: 1000,
      watcher: 'off',
      timezone: '(GMT+7:00) Bangkok, Hanoi, Jakarta',
      sessionOnlyMemory: 'off',
      ignoreTeamHandoff: false,
    },
  } as const),
})

export const pocPatch = z.object({
  name: z.string().trim().min(1).max(120),
  config: pocConfigPatch,
}).partial().refine((p) => p.name !== undefined || p.config !== undefined, 'Nothing to update')

export const mcpServerInput = z.object({ name: z.string().trim().min(1).max(80), url: httpUrl })
export const mcpServerPatch = z.object({ name: z.string().trim().min(1).max(80), url: httpUrl, enabled: z.boolean() }).partial()

export const versionInput = z.object({
  content: docContent,
  origin: z.enum(['manual', 'restore']),
  note: z.string().max(2_000).default(''),
})

export const pocVersionInput = z.object({
  config: pocConfig,
  origin: z.enum(['manual', 'ai', 'restore']).default('manual'),
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

export const n8nNodeInput = z.object({
  name: z.string().trim().min(1).max(120),
  node_type: z.string().trim().min(1).max(200),
  kind: z.enum(['trigger', 'action']).default('action'),
  description: z.string().max(5_000).default(''),
  example: z.record(z.string(), z.unknown()).default({}),
})
export const n8nNodePatch = n8nNodeInput.partial()
export const n8nWorkflowImport = z.object({ workflow: z.unknown() })
