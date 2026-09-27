// Data access layer (repository pattern) — every call to the local server's REST API lives here.
import type { AnyDocContent, DocType } from '../../shared/schemas.ts'
import type {
  AiModel,
  AiModelList,
  ChatMessage,
  DocTemplate,
  DocTemplateInput,
  DocumentRow,
  DocumentVersion,
  EffortSetting,
  KnowledgeDocument,
  McpServer,
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
