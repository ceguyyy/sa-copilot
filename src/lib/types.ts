import type { AnyDocContent, DocType, SkillOutputType } from '../../shared/schemas.ts'

export type ProjectStatus = 'discovery' | 'assessment' | 'proposal' | 'won' | 'lost' | 'delivery'
export const PROJECT_STATUSES: ProjectStatus[] = ['discovery', 'assessment', 'proposal', 'won', 'lost', 'delivery']

export interface Project {
  id: string
  name: string
  client_name: string
  industry: string | null
  package: string | null
  status: ProjectStatus
  description: string | null
  /** Language the AI writes this project's documents and replies in. */
  language: string
  created_at: string
  updated_at: string
}

export type ProjectInput = Pick<Project, 'name' | 'client_name' | 'industry' | 'package' | 'status' | 'description' | 'language'>

export interface Source {
  id: string
  project_id: string | null
  kind: 'requirement' | 'knowledge'
  name: string
  mime_type: string | null
  storage_path: string | null
  extracted_text: string | null
  size_bytes: number | null
  /** Disabled sources are kept but not given to the AI. */
  enabled: boolean
  created_at: string
}

export interface Skill {
  id: string
  name: string
  output_type: SkillOutputType
  description: string
  instructions: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export type SkillInput = Pick<Skill, 'name' | 'output_type' | 'description' | 'instructions' | 'is_default'>

export interface DocumentRow {
  id: string
  project_id: string
  type: DocType
  title: string
  /** Shared with every project's AI context as a reference document. */
  is_knowledge: boolean
  template_id: string | null
  /** Absolute paths of the files last auto-exported to disk. */
  export_files: string[]
  created_at: string
  updated_at: string
}

export type VersionOrigin = 'ai' | 'manual' | 'restore'

export interface DocumentVersion {
  id: string
  document_id: string
  version_no: number
  content: AnyDocContent
  note: string
  origin: VersionOrigin
  skill_id: string | null
  created_at: string
}

export interface ChatMessage {
  id: string
  project_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface KnowledgeDocument extends DocumentRow {
  project_name: string
}

export interface DocTemplate {
  id: string
  name: string
  description: string
  instructions: string
  created_at: string
  updated_at: string
}

export type DocTemplateInput = Pick<DocTemplate, 'name' | 'description' | 'instructions'>

export interface McpServer {
  id: string
  name: string
  url: string
  enabled: boolean
  created_at: string
  /** Tools the AI can use from this server (empty when disabled or unreachable). */
  tools: string[]
}

export interface ProjectFile {
  name: string
  size: number
  modified: string
}

export type EffortSetting = 'default' | 'low' | 'medium' | 'high'

export interface AiModel {
  id: string
  provider: string
  name: string
  format: 'anthropic' | 'openai'
  tools: boolean
  vision: boolean
  pdf: boolean
  reasoning: boolean
  adaptiveThinking: boolean
  maxOutput: number | null
  custom: boolean
}

export interface AiModelList {
  models: AiModel[]
  selected: string
  effort: EffortSetting
  proxied: boolean
}
