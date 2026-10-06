export type AiActivity = {
  id: string
  task: string
  projectId?: string
  model?: string
  status: 'working' | 'done' | 'error'
  startedAt: number
  finishedAt?: number
  detail: string
  updatedAt?: number
  characters?: number
  tool?: string
  toolCalls?: number
  modelCalls?: number
  provider?: string
  format?: string
  effort?: string
  maxTokens?: number
  documentType?: string
  documentId?: string
  attachmentCount?: number
  added?: number
}
