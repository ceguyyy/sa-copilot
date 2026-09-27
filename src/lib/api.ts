// Data access layer (repository pattern) — every Supabase query lives here.
import type { AnyDocContent, DocType } from '../../supabase/functions/_shared/schemas.ts'
import { supabase } from './supabase'
import type {
  ChatMessage,
  DocumentRow,
  DocumentVersion,
  Project,
  ProjectInput,
  Skill,
  SkillInput,
  Source,
  VersionOrigin,
} from './types'

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  if (res.data === null) throw new Error(`${what}: not found`)
  return res.data
}

// ---------- projects ----------

export const projectsApi = {
  async list(): Promise<Project[]> {
    return unwrap(await supabase.from('projects').select('*').order('updated_at', { ascending: false }), 'Load projects')
  },
  async get(id: string): Promise<Project> {
    return unwrap(await supabase.from('projects').select('*').eq('id', id).single(), 'Load project')
  },
  async create(input: ProjectInput): Promise<Project> {
    return unwrap(await supabase.from('projects').insert(input).select().single(), 'Create project')
  },
  async update(id: string, input: Partial<ProjectInput>): Promise<Project> {
    return unwrap(await supabase.from('projects').update(input).eq('id', id).select().single(), 'Update project')
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) throw new Error(`Delete project: ${error.message}`)
  },
}

// ---------- sources ----------

export const sourcesApi = {
  async list(projectId: string | null): Promise<Source[]> {
    const q = supabase.from('sources').select('*').order('created_at', { ascending: false })
    const res = projectId ? await q.eq('project_id', projectId) : await q.is('project_id', null)
    return unwrap(res, 'Load sources')
  },
  async upload(params: {
    projectId: string | null
    kind: Source['kind']
    file: File
    extractedText: string
  }): Promise<Source> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Not signed in')
    const safeName = params.file.name.replace(/[^\w.-]+/g, '_')
    const path = `${auth.user.id}/${params.projectId ?? 'global'}/${crypto.randomUUID()}-${safeName}`
    const up = await supabase.storage.from('sources').upload(path, params.file, { contentType: params.file.type })
    if (up.error) throw new Error(`Upload ${params.file.name}: ${up.error.message}`)
    return unwrap(
      await supabase
        .from('sources')
        .insert({
          project_id: params.projectId,
          kind: params.kind,
          name: params.file.name,
          mime_type: params.file.type || null,
          storage_path: path,
          extracted_text: params.extractedText,
          size_bytes: params.file.size,
        })
        .select()
        .single(),
      'Save source',
    )
  },
  async addText(params: { projectId: string | null; kind: Source['kind']; name: string; text: string }): Promise<Source> {
    return unwrap(
      await supabase
        .from('sources')
        .insert({ project_id: params.projectId, kind: params.kind, name: params.name, extracted_text: params.text, mime_type: 'text/plain' })
        .select()
        .single(),
      'Save note',
    )
  },
  async remove(source: Source): Promise<void> {
    if (source.storage_path) {
      const { error } = await supabase.storage.from('sources').remove([source.storage_path])
      if (error) throw new Error(`Delete file: ${error.message}`)
    }
    const { error } = await supabase.from('sources').delete().eq('id', source.id)
    if (error) throw new Error(`Delete source: ${error.message}`)
  },
}

// ---------- skills ----------

export const skillsApi = {
  async list(): Promise<Skill[]> {
    return unwrap(await supabase.from('skills').select('*').order('output_type').order('name'), 'Load skills')
  },
  async create(input: SkillInput): Promise<Skill> {
    return unwrap(await supabase.from('skills').insert(input).select().single(), 'Create skill')
  },
  async createMany(inputs: SkillInput[]): Promise<void> {
    const { error } = await supabase.from('skills').insert(inputs)
    if (error) throw new Error(`Seed skills: ${error.message}`)
  },
  async update(id: string, input: Partial<SkillInput>): Promise<Skill> {
    return unwrap(await supabase.from('skills').update(input).eq('id', id).select().single(), 'Update skill')
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('skills').delete().eq('id', id)
    if (error) throw new Error(`Delete skill: ${error.message}`)
  },
}

// ---------- documents & versions ----------

export const documentsApi = {
  async list(projectId: string): Promise<DocumentRow[]> {
    return unwrap(
      await supabase.from('documents').select('*').eq('project_id', projectId).order('updated_at', { ascending: false }),
      'Load documents',
    )
  },
  async get(id: string): Promise<DocumentRow> {
    return unwrap(await supabase.from('documents').select('*').eq('id', id).single(), 'Load document')
  },
  async create(projectId: string, type: DocType, title: string, content: AnyDocContent): Promise<DocumentRow> {
    const doc = unwrap<DocumentRow>(
      await supabase.from('documents').insert({ project_id: projectId, type, title }).select().single(),
      'Create document',
    )
    await versionsApi.create(doc.id, content, 'manual', 'Created manually')
    return doc
  },
  async rename(id: string, title: string): Promise<void> {
    const { error } = await supabase.from('documents').update({ title }).eq('id', id)
    if (error) throw new Error(`Rename document: ${error.message}`)
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('documents').delete().eq('id', id)
    if (error) throw new Error(`Delete document: ${error.message}`)
  },
}

export const versionsApi = {
  async list(documentId: string): Promise<DocumentVersion[]> {
    return unwrap(
      await supabase
        .from('document_versions')
        .select('*')
        .eq('document_id', documentId)
        .order('version_no', { ascending: false }),
      'Load versions',
    )
  },
  async create(documentId: string, content: AnyDocContent, origin: VersionOrigin, note: string): Promise<DocumentVersion> {
    return unwrap(
      await supabase.from('document_versions').insert({ document_id: documentId, content, origin, note }).select().single(),
      'Save version',
    )
  },
  /** Restoring never rewrites history — it appends a copy of the old version. */
  async restore(documentId: string, version: DocumentVersion): Promise<DocumentVersion> {
    return versionsApi.create(documentId, version.content, 'restore', `Restored from v${version.version_no}`)
  },
}

// ---------- chat ----------

export const messagesApi = {
  async list(projectId: string): Promise<ChatMessage[]> {
    return unwrap(
      await supabase.from('messages').select('*').eq('project_id', projectId).order('created_at'),
      'Load chat',
    )
  },
  async clear(projectId: string): Promise<void> {
    const { error } = await supabase.from('messages').delete().eq('project_id', projectId)
    if (error) throw new Error(`Clear chat: ${error.message}`)
  },
}
