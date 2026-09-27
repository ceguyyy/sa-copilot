import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, GitBranch, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DIAGRAM_KINDS, DOC_LABELS, PIPELINE, type DocType } from '../../supabase/functions/_shared/schemas.ts'
import { ChatPanel } from '../components/ChatPanel'
import { SourcesPanel } from '../components/SourcesPanel'
import { Badge, Button, ErrorNote, PageHeader, Select, Spinner } from '../components/ui'
import { documentsApi, projectsApi } from '../lib/api'
import { PROJECT_STATUSES, type DocumentRow, type ProjectStatus } from '../lib/types'
import { useGenerate } from '../lib/useGenerate'

const STEP_HINT: Record<DocType, string> = {
  assessment: '12 standard questions answered from the requirements',
  tor: 'Package + custom scope (Layanan / Sub Layanan)',
  timeline: 'Activities & SLA/Days — you set the mandays',
  sow_cekat: 'Internal Cekat format, Bahasa Indonesia',
  sow_cif: 'Meta Client Integration Fund format',
  onboarding: 'Form the client fills before kickoff',
  diagram: '',
}

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => projectsApi.get(projectId) })
  const docs = useQuery({ queryKey: ['documents', projectId], queryFn: () => documentsApi.list(projectId) })
  const gen = useGenerate(projectId)
  const [diagramKind, setDiagramKind] = useState<string>('activity')

  const setStatus = useMutation({
    mutationFn: (status: ProjectStatus) => projectsApi.update(projectId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })
  const removeProject = useMutation({
    mutationFn: () => projectsApi.remove(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate('/')
    },
  })

  async function generateAndOpen(docType: DocType, extra: { diagramKind?: string } = {}) {
    const done = await gen.run({ docType, ...extra })
    if (done?.documentId) navigate(`/projects/${projectId}/docs/${done.documentId}`)
  }

  if (project.isLoading) return <Spinner />
  if (!project.data) return <ErrorNote error={project.error ?? 'Project not found'} />
  const p = project.data
  const byType = new Map<DocType, DocumentRow>()
  const diagrams: DocumentRow[] = []
  for (const d of docs.data ?? []) {
    if (d.type === 'diagram') diagrams.push(d)
    else if (!byType.has(d.type)) byType.set(d.type, d)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-10">
        <PageHeader
          kicker={p.client_name}
          title={p.name}
          actions={
            <>
              <Select aria-label="Project status" value={p.status} onChange={(e) => setStatus.mutate(e.target.value as ProjectStatus)} className="w-36">
                {PROJECT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => confirm(`Delete project "${p.name}" and all its documents?`) && removeProject.mutate()}>
                Delete
              </Button>
            </>
          }
        />
        <p className="-mt-6 font-mono text-xs text-muted">
          {p.package ?? '—'} · {p.industry || 'industry n/a'}
          {p.description ? ` · ${p.description}` : ''}
        </p>

        <SourcesPanel projectId={projectId} kinds={['requirement', 'knowledge']} title="Requirements & knowledge" />

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-xl font-semibold">Deliverables</h2>
            {gen.running && (
              <p className="font-mono text-xs text-ember" aria-live="polite">
                Drafting {DOC_LABELS[gen.running]}… {gen.chars.toLocaleString()} chars
              </p>
            )}
          </div>
          <ErrorNote error={gen.error} />
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PIPELINE.map((type, i) => {
              const doc = byType.get(type)
              return (
                <li key={type} className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-panel p-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-ember">0{i + 1}</span>
                      {doc ? <Badge tone="ok">drafted</Badge> : <Badge>empty</Badge>}
                    </div>
                    <h3 className="mt-2 font-display text-lg font-semibold">{DOC_LABELS[type]}</h3>
                    <p className="text-xs text-muted">{STEP_HINT[type]}</p>
                  </div>
                  {doc ? (
                    <Link to={`/projects/${projectId}/docs/${doc.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">
                      Open · updated {new Date(doc.updated_at).toLocaleDateString()} <ArrowRight className="size-3.5" />
                    </Link>
                  ) : (
                    <Button variant="ai" icon={<Sparkles className="size-4" />} loading={gen.running === type} disabled={!!gen.running} onClick={() => generateAndOpen(type)}>
                      Draft with AI
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">Diagrams</h2>
            <div className="flex gap-2">
              <Select aria-label="Diagram kind" value={diagramKind} onChange={(e) => setDiagramKind(e.target.value)} className="w-36">
                {DIAGRAM_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
              <Button variant="ai" icon={<GitBranch className="size-4" />} loading={gen.running === 'diagram'} disabled={!!gen.running} onClick={() => generateAndOpen('diagram', { diagramKind })}>
                New diagram
              </Button>
            </div>
          </div>
          {diagrams.length === 0 ? (
            <p className="text-sm text-muted">Activity, sequence, state, ER… generated from the project context as Mermaid.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
              {diagrams.map((d) => (
                <li key={d.id}>
                  <Link to={`/projects/${projectId}/docs/${d.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-forest-soft">
                    <span>{d.title}</span>
                    <span className="font-mono text-[11px] text-muted">{new Date(d.updated_at).toLocaleString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ChatPanel projectId={projectId} />
    </div>
  )
}
