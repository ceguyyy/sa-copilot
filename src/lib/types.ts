import type { AnyDocContent, DocType, SkillOutputType } from '../../supabase/functions/_shared/schemas.ts'

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
  created_at: string
  updated_at: string
}

export type ProjectInput = Pick<Project, 'name' | 'client_name' | 'industry' | 'package' | 'status' | 'description'>

export interface Source {
  id: string
  project_id: string | null
  kind: 'requirement' | 'knowledge'
  name: string
  mime_type: string | null
  storage_path: string | null
  extracted_text: string | null
  size_bytes: number | null
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
