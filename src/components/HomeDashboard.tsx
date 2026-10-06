import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Cloud, FileText, FolderKanban, HelpCircle, NotebookPen, Plus, ScanSearch, Sparkles, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PIPELINE } from '../../shared/schemas.ts'
import { authApi, dashboardApi, documentsApi, maintenanceApi } from '../lib/api'
import { readRecentWork } from '../lib/recentWork'
import { Badge, Card, ErrorNote, Select } from './ui'

const actionStyle = 'flex items-center gap-3 rounded-xl border border-line bg-panel p-3 text-sm font-medium transition hover:border-forest hover:bg-forest-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest'
const date = (value: string | number) => new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

export function HomeDashboard() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.get, refetchInterval: 30000 })
  const account = useQuery({ queryKey: ['account'], queryFn: authApi.session })
  const cloud = useQuery({ queryKey: ['cloud'], queryFn: maintenanceApi.cloud, retry: false, staleTime: 30000, refetchInterval: 30000 })
  const recent = readRecentWork(account.data?.account?.id)
  const document = useQuery({ queryKey: ['document', recent?.documentId], queryFn: () => documentsApi.get(recent!.documentId!), enabled: !!recent?.documentId, retry: false })
  const rows = dashboard.data ?? []
  const active = rows.filter(p => p.status !== 'lost')
  const remembered = rows.find(p => p.id === recent?.projectId)
  const resume = remembered ?? active[0] ?? rows[0]
  const validDocument = remembered && document.data?.project_id === remembered.id ? document.data : undefined
  const [selectedProject, setSelectedProject] = useState('')
  const selected = rows.find(p => p.id === selectedProject) ?? resume
  const projectLink = selected ? `/projects/${selected.id}` : ''
  const attention = active.filter(p => p.open_questions || p.last_check_issues || p.revision_drafts || p.review_alerts)
  const questions = active.reduce((sum, p) => sum + p.open_questions, 0)
  const issues = active.reduce((sum, p) => sum + (p.last_check_issues ?? 0), 0)
  const reviews = active.reduce((sum, p) => sum + (p.review_alerts ?? 0), 0)
  const drafts = active.reduce((sum, p) => sum + (p.revision_drafts ?? 0), 0)

  return <div className="space-y-5">
    <ErrorNote error={dashboard.error} />
    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: 'Active projects', value: active.length, icon: FolderKanban }, { label: 'Awaiting client answers', value: questions, icon: HelpCircle }, { label: 'Revision drafts to review', value: drafts, icon: FileText }].map(({ label, value, icon: Icon }) => <Card key={label} className="flex h-full min-w-0 items-center gap-3 p-4"><span className="rounded-xl bg-forest-soft p-3 text-forest"><Icon className="size-5" /></span><div><p className="text-2xl font-semibold">{dashboard.isPending || dashboard.isError ? '—' : value}</p><p className="min-h-8 text-xs text-muted">{label}</p></div></Card>)}
    </div>
    <div className="grid items-stretch gap-4 lg:auto-rows-fr lg:grid-cols-2">
<Card className="flex h-full min-w-0 flex-col justify-between gap-4 p-5 sm:p-6">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-ember">Continue working</p><h2 className="mt-2 text-xl font-semibold">{resume ? validDocument?.title ?? resume.name : dashboard.isPending ? 'Loading your workspace...' : dashboard.isError ? 'Workspace unavailable' : 'Start your first project'}</h2><p className="mt-2 text-sm text-muted">{resume ? validDocument ? `Document in ${resume.name}` : remembered ? 'Pick up where you left off.' : 'Your most recently active project.' : dashboard.isError ? 'Refresh Home to reconnect to your project data.' : 'Create a project to collect requirements, draft deliverables and collaborate with AI.'}</p>{remembered && recent && <p className="mt-2 text-xs text-muted">Last opened {date(recent.visitedAt)}</p>}{remembered && document.isError && <p className="mt-2 text-xs text-muted">The last document is unavailable. You can still reopen its project.</p>}</div>
        <Link to={resume ? validDocument ? `/projects/${resume.id}/docs/${validDocument.id}` : `/projects/${resume.id}` : '/?create=1'} className="inline-flex w-fit items-center gap-2 rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper hover:brightness-110">{resume ? validDocument ? 'Continue document' : 'Continue project' : 'Create project'}<ArrowRight className="size-4" /></Link>
      </Card>
<Card className="flex h-full min-w-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-5"><h2 className="text-lg font-semibold">Needs attention</h2><Badge tone={attention.length ? 'warn' : 'neutral'}>{dashboard.isPending ? 'Checking' : dashboard.isError ? 'Unavailable' : `${questions + issues + drafts + reviews} items`}</Badge></div>
        <div className="max-h-56 min-h-0 flex-1 space-y-3 overflow-y-auto p-5">{dashboard.isPending ? <p className="text-sm text-muted">Checking your projects...</p> : dashboard.isError ? <p className="text-sm text-muted">Project attention status is unavailable.</p> : !attention.length ? <p className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="size-4" /> No outstanding items in active projects.</p> : attention.map(p => <div key={p.id} className="rounded-xl border border-line p-4"><Link className="text-sm font-semibold hover:underline" to={`/projects/${p.id}`}>{p.name}</Link><div className="mt-3 flex flex-wrap gap-2">{!!p.review_alerts && <Link className="rounded-lg bg-ember-soft px-3 py-2 text-xs text-warn" to={`/projects/${p.id}?tab=deliverables`}>{p.review_alerts} items need review</Link>}{!!p.open_questions && <Link className="rounded-lg bg-paper px-3 py-2 text-xs text-ink hover:bg-forest-soft" to={`/projects/${p.id}?tab=requirements#project-questions`}>{p.open_questions} open question{p.open_questions === 1 ? '' : 's'}</Link>}{!!p.last_check_issues && <Link className="rounded-lg bg-ember-soft px-3 py-2 text-xs text-warn" to={`/projects/${p.id}?tab=deliverables`}>{p.last_check_issues} consistency issue{p.last_check_issues === 1 ? '' : 's'}</Link>}{!!p.revision_drafts && <Link className="rounded-lg bg-forest-soft px-3 py-2 text-xs text-forest" to={`/projects/${p.id}?tab=requirements&action=review-revisions`}>{p.revision_drafts} revision draft{p.revision_drafts === 1 ? '' : 's'}</Link>}</div></div>)}</div>
      </Card>
<Card className="flex h-full min-w-0 flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Quick actions</h2>{rows.length > 0 && <Select aria-label="Project for quick actions" className="sm:max-w-[240px]" value={selected?.id ?? ''} onChange={e => setSelectedProject(e.target.value)}>{rows.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link className={actionStyle} to="/?create=1"><Plus className="size-4 shrink-0 text-forest" />New project</Link>
          {[{ label: 'Upload requirements', icon: Upload, action: 'upload' }, { label: 'Meeting notes', icon: NotebookPen, action: 'meeting' }, { label: 'AI Enhancement', icon: Sparkles, action: 'enhance' }].map(({ label, icon: Icon, action }) => selected ? <Link key={action} className={actionStyle} to={`${projectLink}?tab=requirements&action=${action}`}><Icon className="size-4 shrink-0 text-forest" />{label}</Link> : <button key={action} disabled className={`${actionStyle} cursor-not-allowed opacity-50`}><Icon className="size-4 shrink-0" />{label}</button>)}
        </div>
        {!rows.length && <p className="text-xs text-muted">Create a project to enable project actions.</p>}
      </Card>
<Card className="flex h-full min-w-0 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-2"><Cloud className="size-5 text-forest" /><h2 className="font-semibold">Backup status</h2></div>
        <ErrorNote error={cloud.error} />
        {cloud.isPending ? <p className="text-sm text-muted">Checking cloud backup...</p> : cloud.isError ? <p className="text-sm text-muted">Cloud status is unavailable.</p> : !cloud.data?.configured ? <p className="text-sm text-muted">Cloud backup is not configured yet.</p> : <><Badge tone={cloud.data.localRevision === cloud.data.remoteRevision ? 'ok' : 'warn'}>{cloud.data.localRevision === cloud.data.remoteRevision ? 'Revisions match' : 'Download required'}</Badge><dl className="space-y-2 text-sm"><div className="flex justify-between gap-2"><dt className="text-muted">This computer</dt><dd>Revision {cloud.data.localRevision}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted">Cloud</dt><dd>Revision {cloud.data.remoteRevision}</dd></div></dl><div><p className="text-xs text-muted">Latest cloud snapshot</p><p className="mt-1 text-sm">{cloud.data.updatedAt ? date(cloud.data.updatedAt) : 'No cloud snapshot yet'}</p></div><p className="text-xs leading-relaxed text-muted">{cloud.data.localChangeStatus === 'changed' ? 'Local changes since last backup. Upload before switching computers.' : cloud.data.localChangeStatus === 'clean' ? 'Your local changes are backed up.' : 'Local change status is unknown. Upload once to establish a baseline.'}</p></>}
        <Link to="/settings/backup" className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-forest hover:underline">Manage backups<ArrowRight className="size-4" /></Link>
      </Card>
    </div>
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line p-5"><h2 className="text-lg font-semibold">Project overview</h2><Link to="/" className="text-sm text-forest hover:underline">All projects</Link></div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{dashboard.isPending ? <p className="text-sm text-muted">Loading projects...</p> : dashboard.isError ? <p className="text-sm text-muted">Project overview is unavailable.</p> : !active.length ? <p className="text-sm text-muted">No active projects yet.</p> : active.slice(0, 6).map(p => <Link key={p.id} to={`/projects/${p.id}?tab=deliverables`} className="flex h-full min-w-0 flex-col gap-3 rounded-xl border border-line p-4 transition hover:border-forest"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="min-h-10 line-clamp-2 break-words text-sm font-semibold">{p.name}</h3><p className="mt-1 text-xs text-muted">{p.client_name}</p></div><Badge>{p.status}</Badge></div><div className="flex justify-between text-xs"><span className="text-muted">Deliverables</span><span>{p.drafted}/{PIPELINE.length} drafted</span></div><div role="progressbar" aria-label={`${p.name} deliverables`} aria-valuemin={0} aria-valuemax={PIPELINE.length} aria-valuenow={p.drafted} className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-forest" style={{ width: `${Math.min(100, p.drafted / PIPELINE.length * 100)}%` }} /></div><p className="mt-auto flex items-center gap-2 text-xs text-muted"><ScanSearch className="size-3.5" />{p.last_check_issues == null ? 'Consistency not checked yet' : `${p.last_check_issues} consistency issue{p.last_check_issues === 1 ? '' : 's'}`}</p></Link>)}</div>
    </Card>
  </div>
}
