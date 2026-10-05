// Data access layer (repository pattern) — every call to the local server's REST API lives here.
import type { AnyDocContent, DocType } from '../../shared/schemas.ts'
import type { Theme, ThemeMode } from '../../shared/theme.ts'
import type { QaKnowledge, QaRunRow, QaSuite } from '../../shared/pocQa.ts'
import type { AiActivity } from '../../shared/activity.ts'
import type { CloudStatus, UpdateStatus } from '../../shared/maintenance.ts'

export const maintenanceApi = {
  updates: () => request<UpdateStatus>('Load version', '/updates'),
  check: () => send<UpdateStatus>('Check updates', 'POST', '/updates/check'),
  upgrade: (commit: string) => send<UpdateStatus>('Upgrade', 'POST', '/updates/upgrade', { commit }),
  cloud: () => request<CloudStatus>('Load cloud status', '/cloud'),
  push: () => send<{ revision: number }>('Upload cloud backup', 'POST', '/cloud/push'),
  pull: (revision: number) => send<{ revision: number; safetyBackup: string }>('Download cloud backup', 'POST', '/cloud/pull', { revision, confirm: 'RESTORE' }),
}

export const activityApi = { list: () => request<AiActivity[]>('Load AI activity', '/ai/activity') }
import type {
  AiModel,
  BackupInspect,
  BackupRestoreResult,
  AiModelList,
  ChatMessage,
  DocTemplate,
  DocTemplateInput,
  DocumentRow,
  DocumentVersion,
  EffortSetting,
  KnowledgeDocument,
  McpServer,
  N8nNodeSkill,
  N8nNodeSkillInput,
  PocConfig,
  PocRow,
  PocVersion,
  ProjectFile,
  Project,
  ProjectInput,
  Skill,
  SkillInput,
  Source,
  VersionOrigin,
} from './types'

async function request<T>(what: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new Error(`${what}: cannot reach the SA Copilot server — is it running?`)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(`${what}: ${body?.error ?? res.statusText}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const send = <T>(what: string, method: string, path: string, body?: unknown) =>
  request<T>(what, path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

// ---------- projects ----------

export const projectsApi = {
  list: () => request<Project[]>('Load projects', '/projects'),
  get: (id: string) => request<Project>('Load project', `/projects/${id}`),
  create: (input: ProjectInput) => send<Project>('Create project', 'POST', '/projects', input),
  update: (id: string, input: Partial<ProjectInput>) => send<Project>('Update project', 'PATCH', `/projects/${id}`, input),
  remove: (id: string) => send<void>('Delete project', 'DELETE', `/projects/${id}`),
  sendToNotion: (id: string) => send<{ url: string; blocks: number }>('Send to Notion', 'POST', `/projects/${id}/notion`),
  /** Download link for the whole project as one Markdown file. */
  markdownUrl: (id: string) => `/api/projects/${id}/export.md`,
}

// ---------- sources ----------

export const sourcesApi = {
  list(projectId: string | null): Promise<Source[]> {
    return request('Load sources', projectId ? `/sources?projectId=${projectId}` : '/sources')
  },
  upload(params: { projectId: string | null; kind: Source['kind']; file: File; extractedText: string }): Promise<Source> {
    const form = new FormData()
    form.set('file', params.file)
    form.set('kind', params.kind)
    form.set('extractedText', params.extractedText)
    if (params.projectId) form.set('projectId', params.projectId)
    return request(`Upload ${params.file.name}`, '/sources/upload', { method: 'POST', body: form })
  },
  addText(params: { projectId: string | null; kind: Source['kind']; name: string; text: string }): Promise<Source> {
    return send('Save note', 'POST', '/sources/text', params)
  },
  scrape(params: { projectId: string | null; url: string }): Promise<Source> {
    return send('Import website', 'POST', '/sources/scrape', params)
  },
  setEnabled: (id: string, enabled: boolean) => send<Source>('Update source', 'PATCH', `/sources/${id}`, { enabled }),
  remove: (source: Source) => send<void>('Delete source', 'DELETE', `/sources/${source.id}`),
}

// ---------- skills ----------

export const skillsApi = {
  list: () => request<Skill[]>('Load skills', '/skills'),
  create: (input: SkillInput) => send<Skill>('Create skill', 'POST', '/skills', input),
  createMany: (inputs: SkillInput[]) => send<void>('Seed skills', 'POST', '/skills/bulk', inputs),
  update: (id: string, input: Partial<SkillInput>) => send<Skill>('Update skill', 'PATCH', `/skills/${id}`, input),
  remove: (id: string) => send<void>('Delete skill', 'DELETE', `/skills/${id}`),
}

// ---------- documents & versions ----------

export const documentsApi = {
  list: (projectId: string) => request<DocumentRow[]>('Load documents', `/projects/${projectId}/documents`),
  get: (id: string) => request<DocumentRow>('Load document', `/documents/${id}`),
  create(projectId: string, type: DocType, title: string, content: AnyDocContent, templateId?: string): Promise<DocumentRow> {
    return send('Create document', 'POST', '/documents', { projectId, type, title, content, templateId: templateId ?? null })
  },
  rename: (id: string, title: string) => send<DocumentRow>('Rename document', 'PATCH', `/documents/${id}`, { title }),
  setKnowledge: (id: string, isKnowledge: boolean) =>
    send<DocumentRow>('Update knowledge flag', 'PATCH', `/documents/${id}`, { is_knowledge: isKnowledge }),
  listKnowledge: () => request<KnowledgeDocument[]>('Load knowledge documents', '/documents/knowledge'),
  remove: (id: string) => send<void>('Delete document', 'DELETE', `/documents/${id}`),
}

export const versionsApi = {
  list: (documentId: string) => request<DocumentVersion[]>('Load versions', `/documents/${documentId}/versions`),
  create(documentId: string, content: AnyDocContent, origin: VersionOrigin, note: string): Promise<DocumentVersion> {
    return send('Save version', 'POST', `/documents/${documentId}/versions`, { content, origin, note })
  },
  /** Restoring never rewrites history — it appends a copy of the old version. */
  restore(documentId: string, version: DocumentVersion): Promise<DocumentVersion> {
    return versionsApi.create(documentId, version.content, 'restore', `Restored from v${version.version_no}`)
  },
}

// ---------- Cekat n8n node catalog ----------

export const n8nNodesApi = {
  list: () => request<N8nNodeSkill[]>('Load n8n nodes', '/n8n-nodes'),
  create: (input: N8nNodeSkillInput) => send<N8nNodeSkill>('Add n8n node', 'POST', '/n8n-nodes', input),
  importWorkflow: (workflow: string) => send<N8nNodeSkill[]>('Import n8n workflow', 'POST', '/n8n-nodes/import', { workflow }),
  update: (id: string, input: Partial<N8nNodeSkillInput>) => send<N8nNodeSkill>('Update n8n node', 'PATCH', `/n8n-nodes/${id}`, input),
  remove: (id: string) => send<void>('Delete n8n node', 'DELETE', `/n8n-nodes/${id}`),
}

export const pocsApi = {
  list: (projectId: string) => request<PocRow[]>('Load POCs', `/projects/${projectId}/pocs`),
  get: (id: string) => request<PocRow>('Load POC', `/pocs/${id}`),
  create(projectId: string, name: string, config: PocConfig): Promise<PocRow> {
    return send('Create POC', 'POST', `/projects/${projectId}/pocs`, { projectId, name, config })
  },
  update: (id: string, patch: Partial<{ name: string; config: PocConfig }>) => send<PocRow>('Update POC', 'PATCH', `/pocs/${id}`, patch),
  remove: (id: string) => send<void>('Delete POC', 'DELETE', `/pocs/${id}`),
}

export const pocVersionsApi = {
  list: (pocId: string) => request<PocVersion[]>('Load POC versions', `/pocs/${pocId}/versions`),
  create(pocId: string, config: PocConfig, origin: 'manual' | 'ai' | 'restore', note: string): Promise<PocVersion> {
    return send('Save POC version', 'POST', `/pocs/${pocId}/versions`, { config, origin, note })
  },
  restore: (pocId: string, versionId: string) => send<{ poc: PocRow; version: PocVersion }>('Restore POC version', 'POST', `/pocs/${pocId}/versions/${versionId}/restore`, {}),
}

export const qaRunsApi = {
  list: (pocId: string) => request<QaRunRow[]>('Load QA runs', `/pocs/${pocId}/qa-runs`),
  setActionCheck: (runId: string, caseIndex: number, stepIndex: number, actionCheck: 'pending' | 'pass' | 'fail') =>
    send<QaRunRow>('Save action check', 'PATCH', `/qa-runs/${runId}/action-check`, { caseIndex, stepIndex, actionCheck }),
  remove: (runId: string) => send<void>('Delete QA run', 'DELETE', `/qa-runs/${runId}`),
}

export const qaSuitesApi = {
  list: () => request<QaSuite[]>('Load QA suites', '/qa-suites'),
  create: (name: string) => send<QaSuite>('Create QA suite', 'POST', '/qa-suites', { name }),
  update: (id: string, patch: Partial<Pick<QaSuite, 'name' | 'livechat_url' | 'context' | 'cases'>>) => send<QaSuite>('Save QA suite', 'PATCH', `/qa-suites/${id}`, patch),
  remove: (id: string) => send<void>('Delete QA suite', 'DELETE', `/qa-suites/${id}`),
  knowledge: (id: string) => request<QaKnowledge[]>('Load knowledge', `/qa-suites/${id}/knowledge`),
  addText: (id: string, name: string, text: string) => send<QaKnowledge>('Save knowledge', 'POST', `/qa-suites/${id}/knowledge/text`, { name, text }),
  upload(id: string, file: File, extractedText: string): Promise<QaKnowledge> {
    const form = new FormData()
    form.set('file', file)
    form.set('extractedText', extractedText)
    return request(`Upload ${file.name}`, `/qa-suites/${id}/knowledge/upload`, { method: 'POST', body: form })
  },
  removeKnowledge: (knowledgeId: string) => send<void>('Delete knowledge', 'DELETE', `/qa-knowledge/${knowledgeId}`),
  runs: (id: string) => request<QaRunRow[]>('Load QA runs', `/qa-suites/${id}/runs`),
  setActionCheck: (runId: string, caseIndex: number, stepIndex: number, actionCheck: 'pending' | 'pass' | 'fail') =>
    send<QaRunRow>('Save action check', 'PATCH', `/qa-suite-runs/${runId}/action-check`, { caseIndex, stepIndex, actionCheck }),
  removeRun: (runId: string) => send<void>('Delete QA run', 'DELETE', `/qa-suite-runs/${runId}`),
}

// ---------- chat ----------

export const messagesApi = {
  list: (projectId: string) => request<ChatMessage[]>('Load chat', `/projects/${projectId}/messages`),
  clear: (projectId: string) => send<void>('Clear chat', 'DELETE', `/projects/${projectId}/messages`),
}

// ---------- AI model (9router provider + model) ----------

export const modelsApi = {
  list: () => request<AiModelList>('Load AI models', '/ai/models'),
  select: (model: string) => send<AiModel>('Select AI model', 'PUT', '/ai/model', { model }),
  setEffort: (effort: EffortSetting) => send<{ effort: EffortSetting }>('Set thinking effort', 'PUT', '/ai/effort', { effort }),
}

// ---------- project files on disk (auto-exported deliverables) ----------

const fileUrl = (projectId: string, name: string) => `/projects/${projectId}/files/${encodeURIComponent(name)}`

export const filesApi = {
  list: (projectId: string) => request<{ dir: string; files: ProjectFile[] }>('Load files', `/projects/${projectId}/files`),
  exportAll: (projectId: string) => send<{ exported: number }>('Export files', 'POST', `/projects/${projectId}/files/export`),
  openFolder: (projectId: string) => send<void>('Open folder', 'POST', `/projects/${projectId}/files/open`),
  open: (projectId: string, name: string) => send<void>(`Open ${name}`, 'POST', `${fileUrl(projectId, name)}/open`),
  downloadUrl: (projectId: string, name: string) => `/api${fileUrl(projectId, name)}`,
  remove: (projectId: string, name: string) => send<void>(`Delete ${name}`, 'DELETE', fileUrl(projectId, name)),
}

// ---------- custom deliverable templates ----------

export const templatesApi = {
  list: () => request<DocTemplate[]>('Load templates', '/templates'),
  create: (input: DocTemplateInput) => send<DocTemplate>('Create template', 'POST', '/templates', input),
  update: (id: string, input: Partial<DocTemplateInput>) => send<DocTemplate>('Update template', 'PATCH', `/templates/${id}`, input),
  remove: (id: string) => send<void>('Delete template', 'DELETE', `/templates/${id}`),
}

// ---------- MCP tool servers ----------

export const mcpApi = {
  list: () => request<McpServer[]>('Load tool servers', '/mcp-servers'),
  create: (input: { name: string; url: string }) => send<McpServer>('Add tool server', 'POST', '/mcp-servers', input),
  update: (id: string, input: Partial<Pick<McpServer, 'name' | 'url' | 'enabled'>>) =>
    send<McpServer>('Update tool server', 'PATCH', `/mcp-servers/${id}`, input),
  remove: (id: string) => send<void>('Delete tool server', 'DELETE', `/mcp-servers/${id}`),
}

// ---------- theme ----------

export interface ThemeSettings {
  mode: ThemeMode
  activeId: string
  custom: Theme[]
  presets: Theme[]
}

export const themeApi = {
  get: () => request<ThemeSettings>('Load theme', '/settings/theme'),
  update: (patch: { mode?: ThemeMode; activeId?: string }) => send<ThemeSettings>('Update theme', 'PUT', '/settings/theme', patch),
  save: (theme: Omit<Theme, 'id'>) => send<Theme>('Save theme', 'POST', '/settings/themes', theme),
  remove: (id: string) => send<void>('Delete theme', 'DELETE', `/settings/themes/${id}`),
}

// ---------- files attached to instructions ----------

export interface AttachedFile {
  id: string
  owner_kind: 'skill' | 'template' | 'request'
  owner_id: string | null
  name: string
  mime_type: string | null
  size_bytes: number | null
  text_chars: number | null
  created_at: string
}

export const attachmentsApi = {
  list: (ownerKind: 'skill' | 'template', ownerId: string) =>
    request<AttachedFile[]>('Load reference files', `/attachments?ownerKind=${ownerKind}&ownerId=${ownerId}`),
  upload(params: { file: File; extractedText: string; ownerKind: AttachedFile['owner_kind']; ownerId?: string }): Promise<AttachedFile> {
    const form = new FormData()
    form.set('file', params.file)
    form.set('extractedText', params.extractedText)
    form.set('ownerKind', params.ownerKind)
    if (params.ownerId) form.set('ownerId', params.ownerId)
    return request(`Attach ${params.file.name}`, '/attachments', { method: 'POST', body: form })
  },
  remove: (id: string) => send<void>('Remove file', 'DELETE', `/attachments/${id}`),
}

// ---------- audit trail ----------

export interface AuditEvent {
  id: string
  at: string
  action: string
  summary: string
  detail: Record<string, unknown>
}

export const auditApi = {
  list: (projectId: string) => request<AuditEvent[]>('Load audit trail', `/projects/${projectId}/audit`),
}

// ---------- project languages ----------

export interface LanguageSettings {
  items: string[]
  main: string
}

export const languagesApi = {
  get: () => request<LanguageSettings>('Load languages', '/settings/languages'),
  save: (settings: LanguageSettings) => send<LanguageSettings>('Save languages', 'PUT', '/settings/languages', settings),
}

// ---------- open questions, consistency, dashboard ----------

export interface OpenQuestion {
  id: string
  project_id: string
  question: string
  context: string
  status: 'open' | 'answered' | 'dropped'
  answer: string
  origin: 'manual' | 'ai' | 'meeting'
  created_at: string
  updated_at: string
}

export const questionsApi = {
  list: (projectId: string) => request<OpenQuestion[]>('Load questions', `/projects/${projectId}/questions`),
  create: (projectId: string, input: { question: string; context?: string }) =>
    send<OpenQuestion>('Add question', 'POST', `/projects/${projectId}/questions`, input),
  update: (id: string, patch: Partial<Pick<OpenQuestion, 'question' | 'context' | 'status' | 'answer'>>) =>
    send<OpenQuestion>('Update question', 'PATCH', `/questions/${id}`, patch),
  remove: (id: string) => send<void>('Delete question', 'DELETE', `/questions/${id}`),
}

export interface ConsistencyIssue {
  severity: 'high' | 'medium' | 'low'
  title: string
  documents: string[]
  detail: string
  suggestion: string
}

export interface ConsistencyCheck {
  id: string
  project_id: string
  created_at: string
  model: string
  result: { summary: string; issues: ConsistencyIssue[] }
}

export const consistencyApi = {
  latest: (projectId: string) => request<ConsistencyCheck | null>('Load consistency check', `/projects/${projectId}/consistency`),
}

export interface DashboardRow {
  id: string
  name: string
  client_name: string
  industry: string | null
  package: string | null
  status: Project['status']
  language: string
  updated_at: string
  drafted: number
  custom_docs: number
  diagrams: number
  open_questions: number
  sources: number
  last_check_issues: number | null
  last_activity: string
}

export const dashboardApi = {
  get: () => request<DashboardRow[]>('Load dashboard', '/dashboard'),
}

// ---------- demo app ----------

export interface DemoScenarioPayload {
  name: string
  title: string
  tag: string
  triggerType: 'INBOUND_USER' | 'OUTBOUND_SYSTEM'
  outboundPill?: string
  description: string
  cekatComponents: string[]
  apiScopes: string[]
  ruleNote: string
  stepsDetail: string[]
  initialText: string
  steps: { userReply: string; aiResponse: string; chips?: string[]; enableCard?: boolean; enableFlow?: boolean }[]
}

export interface DemoScenario {
  id: string
  project_id: string
  payload: DemoScenarioPayload
  pushed_at: string | null
  created_at: string
  updated_at: string
}

export interface DemoState {
  configured: boolean
  appUrl: string
  categoryId: string
  categoryLink: string
  scenarios: DemoScenario[]
  /** Scenario ids live in the demo for this project's category (null when not connected). */
  remote: string[] | null
  remoteError: string | null
}

export const demoApi = {
  get: (projectId: string) => request<DemoState>('Load demo', `/projects/${projectId}/demo`),
  update: (id: string, payload: unknown) => send<DemoScenario>('Save scenario', 'PATCH', `/demo-scenarios/${id}`, { payload }),
  remove: (id: string) => send<void>('Delete scenario', 'DELETE', `/demo-scenarios/${id}`),
  push: (projectId: string, ids?: string[]) =>
    send<{ pushed: number; categoryId: string; link: string }>('Push to demo', 'POST', `/projects/${projectId}/demo/push`, { ids }),
}

export interface DemoOverview {
  configured: boolean
  appUrl: string
  projects: { id: string; name: string; client_name: string; scenarios: number; pushed: number; link: string }[]
}

export const demoOverviewApi = {
  get: () => request<DemoOverview>('Load demo', '/demo'),
}

// ---------- backup ----------

function backupForm(file: File, confirm?: string): FormData {
  const form = new FormData()
  form.set('file', file)
  if (confirm) form.set('confirm', confirm)
  return form
}

export const backupApi = {
  downloadUrl: '/api/backup',
  /** Where the server keeps uploads, exports and pre-restore backups. */
  storage: () => request<{ uploads: string; exports: string; backups: string }>('Load storage folders', '/storage'),
  inspect: (file: File) => request<BackupInspect>('Read backup', '/backup/inspect', { method: 'POST', body: backupForm(file) }),
  restore: (file: File) => request<BackupRestoreResult>('Restore backup', '/backup/restore', { method: 'POST', body: backupForm(file, 'RESTORE') }),
}

export const officeApi = {
  status: () => request<{ appUrl: string; connected: boolean; message: string | null }>('Load Claude Office', '/office'),
}
