import { ReviewAlerts } from '../components/ReviewAlerts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronsDownUp, ChevronsUpDown, ExternalLink, FileClock, FileDown, FolderOpen, GitBranch, HelpCircle, LayoutTemplate, ListChecks, MonitorPlay, NotebookText, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DOC_LABELS, PIPELINE, type DocType } from '../../shared/schemas.ts'
import { ChatPanel } from '../components/ChatPanel'
import { CHAT_GRID, useChatSize } from '../lib/chatSize'
import { LanguageSelect } from '../components/LanguageSelect'
import { CustomDeliverables } from '../components/CustomDeliverables'
import { AuditPanel } from '../components/project/AuditPanel'
import { ConsistencyPanel } from '../components/project/ConsistencyPanel'
import { EnhancementPanel } from '../components/project/EnhancementPanel'
import { ProjectSection } from '../components/project/ProjectSection'
import { MeetingNotesPanel } from '../components/project/MeetingNotesPanel'
import { QuestionsPanel } from '../components/project/QuestionsPanel'
import { ProjectTabs } from '../components/project/ProjectTabs'
import { DeliverablesPanel } from '../components/project/DeliverablesPanel'
import { DeliverablesProgress } from '../components/project/DeliverablesProgress'
import { DemoPanel } from '../components/project/DemoPanel'
import { DiagramsPanel } from '../components/project/DiagramsPanel'
import { PocPanel } from '../components/project/PocPanel'
import { ProjectFilesPanel } from '../components/ProjectFilesPanel'
import { SourcesPanel } from '../components/SourcesPanel'
import { Button, ErrorNote, PageHeader, Select, Spinner } from '../components/ui'
import { auditApi, demoApi, documentsApi, filesApi, pocsApi, projectsApi, questionsApi, sourcesApi } from '../lib/api'
import { PROJECT_STATUSES, type DocumentRow, type ProjectStatus } from '../lib/types'
import { useGenerate } from '../lib/useGenerate'

const TABS = [
  {
    id: 'requirements',
    label: 'Requirements',
    focus: 'Requirements & knowledge',
    icon: NotebookText,
    starters: ['Ringkas kebutuhan client dan gap terbesar yang harus dikonfirmasi.', 'Pertanyaan apa yang harus saya tanyakan di discovery call berikutnya?'],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    focus: 'Deliverables',
    icon: ListChecks,
    starters: ['Deliverable mana yang belum konsisten satu sama lain?', 'Apakah SOW sudah sesuai dengan Timeline terbaru?'],
  },
  {
    id: 'custom',
    label: 'Custom',
    focus: 'Custom deliverables',
    icon: LayoutTemplate,
    starters: ['Format custom apa yang cocok untuk project ini?', 'Ringkas isi custom deliverable yang sudah ada.'],
  },
  {
    id: 'diagrams',
    label: 'Diagrams',
    focus: 'Diagrams',
    icon: GitBranch,
    starters: ['Diagram apa yang masih kurang untuk project ini?', 'Jelaskan alur eskalasi ke human agent dalam bentuk langkah.'],
  },
  {
    id: 'poc',
    label: 'POC',
    focus: 'POC',
    icon: NotebookText,
    starters: ['Buat draft konfigurasi POC untuk kebutuhan ini?', 'Apakah API integration ini sudah cukup untuk agent flow yang diinginkan?'],
  },
  {
    id: 'files',
    label: 'Files',
    focus: 'Files',
    icon: FolderOpen,
    starters: ['File mana yang perlu saya kirim ke client untuk tahap ini?', 'Buat draft email pengantar untuk mengirim SOW dan Timeline.'],
  },
  {
    id: 'demo',
    label: 'Demo',
    focus: 'Demo',
    icon: MonitorPlay,
    starters: ['Use case mana yang paling kuat untuk didemokan ke klien ini?', 'Buat naskah presentasi demo 5 menit dari skenario yang ada.'],
  },
  {
    id: 'audit',
    label: 'Audit trail',
    focus: 'Audit trail',
    icon: FileClock,
    starters: ['Apa saja yang berubah minggu ini?', 'Dokumen mana yang dibuat AI dan belum pernah saya edit manual?'],
  },
] as const

type TabId = (typeof TABS)[number]['id']

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const launchAction = params.get('action')
  const [chatSize, setChatSize] = useChatSize()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [sectionState, setSectionState] = useState<Record<string, Record<string, boolean>>>({})
  const expanded = (id: string) => sectionState[projectId]?.[id] ?? (id !== 'meeting' || params.get('action') === 'meeting')
  const setExpanded = (id: string, open: boolean) => setSectionState(previous => ({ ...previous, [projectId]: { ...previous[projectId], [id]: open } }))
  const expandAll = (open: boolean) => setSectionState(previous => ({ ...previous, [projectId]: Object.fromEntries(['meeting', 'sources', 'questions', 'progress', 'consistency', 'deliverables', 'custom', 'diagrams', 'poc', 'files', 'demo', 'audit'].map(id => [id, open])) }))
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => projectsApi.get(projectId) })
  const loadedProjectId = project.data?.id
  useEffect(() => {
    if (!loadedProjectId) return
    const section = launchAction === 'upload' || (location.hash === '#project-requirements' || location.hash.startsWith('#source-')) ? 'sources' : launchAction === 'meeting' ? 'meeting' : (location.hash === '#project-questions' || location.hash.startsWith('#question-')) ? 'questions' : null
    if (!section) return
    const target = section === 'sources' ? 'project-requirements' : section === 'meeting' ? 'project-meeting-notes' : 'project-questions'
    const frame = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [loadedProjectId, launchAction, location.hash])
  const docs = useQuery({ queryKey: ['documents', projectId], queryFn: () => documentsApi.list(projectId) })
  const pocs = useQuery({ queryKey: ['pocs', projectId], queryFn: () => pocsApi.list(projectId) })
  const gen = useGenerate(projectId)
  // Same query keys as the panels, so the tab summaries share their cache.
  const sources = useQuery({ queryKey: ['sources', projectId], queryFn: () => sourcesApi.list(projectId) })
  const files = useQuery({ queryKey: ['files', projectId], queryFn: () => filesApi.list(projectId) })
  const audit = useQuery({ queryKey: ['audit', projectId], queryFn: () => auditApi.list(projectId) })
  const questions = useQuery({ queryKey: ['questions', projectId], queryFn: () => questionsApi.list(projectId) })
  const demo = useQuery({ queryKey: ['demo', projectId], queryFn: () => demoApi.get(projectId) })

  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0]
  const selectTab = (id: TabId) => setParams({ tab: id }, { replace: true })

  const refreshProject = () =>
    Promise.all(['project', 'audit'].map((k) => qc.invalidateQueries({ queryKey: [k, projectId] })).concat(qc.invalidateQueries({ queryKey: ['dashboard'] })))
  const update = useMutation({
    mutationFn: (patch: { status?: ProjectStatus; language?: string }) => projectsApi.update(projectId, patch),
    onSuccess: refreshProject,
  })
  const sendToNotion = useMutation({
    mutationFn: () => projectsApi.sendToNotion(projectId),
    onSuccess: refreshProject,
  })
  const archiveProject = useMutation({
    mutationFn: () => project.data?.archived_at ? projectsApi.unarchive(projectId) : projectsApi.archive(projectId),
    onSuccess: async () => { await qc.invalidateQueries(); navigate('/') },
  })
  const removeProject = useMutation({
    mutationFn: () => projectsApi.remove(projectId),
    onSuccess: () => {
      void qc.invalidateQueries()
      navigate('/')
    },
  })

  async function generateAndOpen(docType: DocType, extra: { diagramKind?: string; templateId?: string; instruction?: string; maxTokens?: number } = {}) {
    const done = await gen.run({ docType, ...extra })
    if (done?.documentId) navigate(`/projects/${projectId}/docs/${done.documentId}`)
  }

  if (project.isLoading) return <Spinner />
  if (!project.data) return <ErrorNote error={project.error ?? 'Project not found'} />
  const p = project.data
  const all = docs.data ?? []
  const ofType = (type: DocType) => all.filter((d: DocumentRow) => d.type === type)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const today = new Date().toDateString()
  const meta: Record<TabId, string> = {
    requirements: sources.data
      ? `${plural(sources.data.length, 'source')} · ${questions.data?.filter((q) => q.status === 'open').length ?? 0} open Q`
      : '…',
    deliverables: `${PIPELINE.filter((t) => all.some((d) => d.type === t)).length}/${PIPELINE.length} drafted`,
    custom: plural(ofType('custom').length, 'document'),
    diagrams: plural(ofType('diagram').length, 'diagram'),
    poc: pocs.data ? plural(pocs.data.length, 'POC') : '…',
    files: files.data ? plural(files.data.files.length, 'file') : '…',
    demo: demo.data
      ? `${plural(demo.data.scenarios.length, 'scenario')}${demo.data.configured ? '' : ' · not connected'}`
      : '…',
    audit: audit.data ? `${audit.data.filter((e) => new Date(e.at).toDateString() === today).length} today` : '…',
  }

  return (
    <div className={`mx-auto grid w-full max-w-[1600px] gap-6 ${CHAT_GRID[chatSize]}`}>
      <div className="min-w-0 space-y-6">
        <ReviewAlerts projectId={projectId} />
        <PageHeader
          kicker={p.client_name}
          title={p.name}
          actions={
            <>
              <LanguageSelect className="w-44" value={p.language} onChange={(language) => update.mutate({ language })} />
              <Select aria-label="Project status" value={p.status} onChange={(e) => update.mutate({ status: e.target.value as ProjectStatus })} className="w-36">
                {PROJECT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <a
                href={projectsApi.markdownUrl(projectId)}
                download
                title="Every deliverable, diagram, client question and POC of this project in one Markdown file"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-paper"
              >
                <FileDown className="size-4" /> Download MD
              </a>
              <Button
                variant="outline"
                icon={<NotebookText className="size-4" />}
                loading={sendToNotion.isPending}
                title={p.notion_page_id ? 'Replace the Notion page with the latest version of this project' : 'Create a Notion page with every deliverable, diagram, question and POC'}
                onClick={() => sendToNotion.mutate()}
              >
                {p.notion_page_id ? 'Update Notion' : 'Send to Notion'}
              </Button>
              <Button variant="outline" loading={archiveProject.isPending} onClick={() => archiveProject.mutate()}>{p.archived_at ? 'Unarchive' : 'Archive'}</Button>
              <ErrorNote error={archiveProject.error} />
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => confirm(`Move project "${p.name}" and all its contents to Trash? You can restore it within 30 days.`) && removeProject.mutate()}>
                Move to Trash
              </Button>
            </>
          }
        />
        <p className="-mt-3 font-mono text-xs text-muted">
          {p.package ?? '—'} · {p.industry || 'industry n/a'} · {p.language}
          {p.description ? ` · ${p.description}` : ''}
        </p>
        {sendToNotion.data && (
          <p className="-mt-3 text-sm text-ok">
            Sent to Notion ({sendToNotion.data.blocks} blocks) —{' '}
            <a href={sendToNotion.data.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">
              open the page <ExternalLink className="size-3.5" />
            </a>
          </p>
        )}
        <ErrorNote error={update.error ?? removeProject.error ?? sendToNotion.error} />

        <ProjectTabs
          tabs={TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon, meta: meta[t.id] }))}
          active={tab.id}
          onSelect={selectTab}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3">
          <EnhancementPanel key={projectId} projectId={projectId} initialOpen={['enhance', 'review-revisions'].includes(params.get('action') ?? '')} initialHistory={params.get('action') === 'review-revisions'} />
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" icon={<ChevronsDownUp className="size-4" />} onClick={() => expandAll(false)}>Collapse all</Button>
            <Button variant="ghost" icon={<ChevronsUpDown className="size-4" />} onClick={() => expandAll(true)}>Expand all</Button>
          </div>
        </div>

        {gen.running && (
          <p className="truncate font-mono text-xs text-ember" aria-live="polite">
            {gen.activity || `Drafting ${DOC_LABELS[gen.running]}… ${gen.chars.toLocaleString()} chars`}
          </p>
        )}
        <ErrorNote error={gen.error} />

        {tab.id === 'requirements' && (
          <div className="space-y-4">
            <MeetingNotesPanel projectId={projectId} expanded={expanded('meeting')} onExpandedChange={open => setExpanded('meeting', open)} />
            <ProjectSection anchor="project-requirements" title="Requirements & knowledge" description={`${sources.data?.length ?? 0} sources · Reference material for every AI draft and revision`} icon={NotebookText} expanded={expanded('sources')} onToggle={() => setExpanded('sources', !expanded('sources'))}>
              <SourcesPanel projectId={projectId} kinds={['requirement', 'knowledge']} title="Requirements & knowledge" hideTitle initialUpload={params.get('action') === 'upload'} />
            </ProjectSection>
            <ProjectSection anchor="project-questions" title="Open questions" description={`${questions.data?.filter(q => q.status === 'open').length ?? 0} awaiting confirmation · Answers become confirmed facts for AI`} icon={HelpCircle} expanded={expanded('questions')} onToggle={() => setExpanded('questions', !expanded('questions'))}>
              <QuestionsPanel projectId={projectId} hideTitle />
            </ProjectSection>
          </div>
        )}
        {tab.id === 'deliverables' && (
          <div className="space-y-6">
            <ProjectSection title="Deliverables progress" icon={ListChecks} expanded={expanded('progress')} onToggle={() => setExpanded('progress', !expanded('progress'))}><DeliverablesProgress projectId={projectId} docs={all} /></ProjectSection>
            <ConsistencyPanel projectId={projectId} hasDocs={all.length > 0} expanded={expanded('consistency')} onExpandedChange={open => setExpanded('consistency', open)} />
            <ProjectSection title="Project deliverables" description="Draft, review and open your client documents" icon={ListChecks} expanded={expanded('deliverables')} onToggle={() => setExpanded('deliverables', !expanded('deliverables'))}><DeliverablesPanel projectId={projectId} docs={all} running={gen.running} onGenerate={(type, instruction, { maxTokens }) => generateAndOpen(type, { instruction, maxTokens })} /></ProjectSection>
          </div>
        )}
        {tab.id === 'custom' && (
          <ProjectSection title="Custom documents" icon={LayoutTemplate} expanded={expanded('custom')} onToggle={() => setExpanded('custom', !expanded('custom'))}><CustomDeliverables projectId={projectId} docs={ofType('custom')} running={gen.running === 'custom'} onGenerate={(templateId, instruction, { maxTokens }) => generateAndOpen('custom', { templateId, instruction, maxTokens })} /></ProjectSection>
        )}
        {tab.id === 'diagrams' && (
          <ProjectSection title="Project diagrams" icon={GitBranch} expanded={expanded('diagrams')} onToggle={() => setExpanded('diagrams', !expanded('diagrams'))}><DiagramsPanel projectId={projectId} diagrams={ofType('diagram')} running={gen.running === 'diagram'} onGenerate={(diagramKind, instruction, { maxTokens }) => generateAndOpen('diagram', { diagramKind, instruction, maxTokens })} /></ProjectSection>
        )}
        {tab.id === 'poc' && <ProjectSection title="Proof of concept" icon={NotebookText} expanded={expanded('poc')} onToggle={() => setExpanded('poc', !expanded('poc'))}><PocPanel projectId={projectId} clientName={p.client_name || p.name} /></ProjectSection>}
        {tab.id === 'files' && <ProjectSection title="Project files" icon={FolderOpen} expanded={expanded('files')} onToggle={() => setExpanded('files', !expanded('files'))}><ProjectFilesPanel projectId={projectId} /></ProjectSection>}
        {tab.id === 'demo' && <ProjectSection title="Demo scenarios" icon={MonitorPlay} expanded={expanded('demo')} onToggle={() => setExpanded('demo', !expanded('demo'))}><DemoPanel projectId={projectId} /></ProjectSection>}
        {tab.id === 'audit' && <ProjectSection title="Project activity" icon={FileClock} expanded={expanded('audit')} onToggle={() => setExpanded('audit', !expanded('audit'))}><AuditPanel projectId={projectId} /></ProjectSection>}
      </div>

      <ChatPanel projectId={projectId} focus={tab.focus} starters={[...tab.starters]} size={chatSize} onSizeChange={setChatSize} />
    </div>
  )
}
