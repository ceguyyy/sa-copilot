import { useQuery } from '@tanstack/react-query'
import { FileText, FolderKanban, HelpCircle } from 'lucide-react'
import { useState } from 'react'
import { authApi, dashboardApi, documentsApi, maintenanceApi } from '../lib/api'
import { readRecentWork } from '../lib/recentWork'
import { ErrorNote } from './ui'
import { AttentionCard, BackupCard, ContinueCard, ProjectOverview, QuickActionsCard, StatCard, type LoadState, type ResumeTarget } from './home/HomeCards'

const date = (value: string | number) => new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const stateOf = (q: { isPending: boolean; isError: boolean }): LoadState => (q.isPending ? 'loading' : q.isError ? 'error' : 'ready')

export function HomeDashboard() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.get, refetchInterval: 30000 })
  const account = useQuery({ queryKey: ['account'], queryFn: authApi.session })
  const cloud = useQuery({ queryKey: ['cloud'], queryFn: maintenanceApi.cloud, retry: false, staleTime: 30000, refetchInterval: 30000 })
  const recent = readRecentWork(account.data?.account?.id)
  const document = useQuery({ queryKey: ['document', recent?.documentId], queryFn: () => documentsApi.get(recent!.documentId!), enabled: !!recent?.documentId, retry: false })
  const [selectedProject, setSelectedProject] = useState('')

  const state = stateOf(dashboard)
  const rows = dashboard.data ?? []
  const active = rows.filter((p) => p.status !== 'lost')
  const remembered = rows.find((p) => p.id === recent?.projectId)
  const resume = remembered ?? active[0] ?? rows[0]
  const validDocument = remembered && document.data?.project_id === remembered.id ? document.data : undefined
  const selected = rows.find((p) => p.id === selectedProject) ?? resume
  const attention = active.filter((p) => p.open_questions || p.last_check_issues || p.revision_drafts || p.review_alerts)
  const sum = (pick: (p: (typeof active)[number]) => number | null) => active.reduce((total, p) => total + (pick(p) ?? 0), 0)
  const questions = sum((p) => p.open_questions)
  const drafts = sum((p) => p.revision_drafts)
  const attentionTotal = questions + drafts + sum((p) => p.last_check_issues) + sum((p) => p.review_alerts)

  const target: ResumeTarget | null = resume
    ? {
        title: validDocument?.title ?? resume.name,
        subtitle: validDocument ? `Document in ${resume.name}` : remembered ? 'Pick up where you left off.' : 'Your most recently active project.',
        href: validDocument ? `/projects/${resume.id}/docs/${validDocument.id}` : `/projects/${resume.id}`,
        label: validDocument ? 'Continue document' : 'Continue project',
        note: remembered && recent ? `Last opened ${date(recent.visitedAt)}${document.isError ? ' · the last document is unavailable, you can still reopen its project' : ''}` : undefined,
      }
    : null

  return (
    <div className="space-y-5">
      <ErrorNote error={dashboard.error} />
      <ErrorNote error={cloud.error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active projects" value={active.length} icon={FolderKanban} state={state} />
        <StatCard label="Awaiting client answers" value={questions} icon={HelpCircle} state={state} />
        <StatCard label="Revision drafts to review" value={drafts} icon={FileText} state={state} />
      </div>
      <div className="grid items-stretch gap-4 lg:auto-rows-fr lg:grid-cols-2">
        <ContinueCard target={target} state={state} />
        <AttentionCard projects={attention} total={attentionTotal} state={state} />
        <QuickActionsCard projects={rows} selectedId={selected?.id ?? ''} onSelect={setSelectedProject} />
        <BackupCard backup={cloud.data} state={stateOf(cloud)} />
      </div>
      <ProjectOverview projects={active} state={state} />
    </div>
  )
}
