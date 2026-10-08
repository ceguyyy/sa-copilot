import type { DocType } from './schemas.ts'

export interface EnhancementItem {
  key: string
  id: string
  kind: 'document' | 'source' | 'demo'
  category: string
  title: string
  editable: boolean
  content: unknown
  versionId?: string
  versionNo?: number
  docType?: DocType
}
export interface EnhancementReport {
  summary: string
  conflicts: { id: string; detail: string; question: string; targetKeys?: string[] }[]
  impacts: { key: string; reason: string }[]
  issues: { detail: string; suggestion: string }[]
}

export type EnhancementRequest =
  | { batchId: string; action: 'analyze' }
  | { batchId: string; action: 'preview'; key: string }
  | { batchId: string; action: 'review'; accepted: string[] }
  | { batchId: string; action: 'repair'; conflictId: string; decision: string; keys: string[]; accepted: string[] }
export interface EnhancementTarget extends EnhancementItem {
  state: 'pending' | 'ready' | 'failed'
  proposed?: unknown
  summary?: string
  error?: string
  model?: string
  appliedVersionId?: string
}
export interface EnhancementBatch {
  id: string
  project_id: string
  prompt: string
  rules: string
  context: EnhancementItem[]
  items: EnhancementTarget[]
  report: EnhancementReport | null
  resolutions: Record<string, string>
  review: EnhancementReport | null
  review_keys: string[]
  accepted: string[]
  state: 'draft' | 'applied' | 'undone'
  created_at: string
}
