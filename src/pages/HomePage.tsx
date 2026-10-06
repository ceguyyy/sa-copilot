import { WorkspaceSearchButton } from '../components/WorkspaceSearch'
import { RecentProjects } from '../components/RecentProjects'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ErrorNote, PageHeader } from '../components/ui'
import { activityApi, projectsApi } from '../lib/api'
import { ActivityDetails } from '../components/ActivityDetails'
import { taskLabel } from '../lib/activity'
import { formatElapsed } from '../lib/elapsed'
import type { AiActivity } from '../../shared/activity'
import { HomeDashboard } from '../components/HomeDashboard'
import './pixel-office.css'

const labels = { working: 'Working', done: 'Done', error: 'Error' }

export function HomePage() {
  const qc = useQueryClient()
  const activity = useQuery({ queryKey: ['ai-activity'], queryFn: activityApi.list, refetchInterval: 2000 })
  const projects = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list })
  const projectName = (job: AiActivity) => projects.data?.find((project) => project.id === job.projectId)?.name
  const [selectedId, setSelectedId] = useState<string>()
  const [feedLimit, setFeedLimit] = useState(10)
  const [now, setNow] = useState(() => Date.now())
  const [filter, setFilter] = useState<'all' | AiActivity['status']>('all')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const jobs = activity.data ?? []
  const selected = jobs.find((job) => job.id === selectedId)
  const filtered = jobs.filter((job) => filter === 'all' || job.status === filter)
  return <div className="mx-auto max-w-[1400px] space-y-6">
    <PageHeader kicker="Your AI workspace" title="Home" actions={<div className="flex flex-wrap items-center gap-2"><WorkspaceSearchButton /><Link to="/" className="rounded-md border border-line px-3 py-1.5 text-sm">Projects</Link><Button variant="outline" icon={<RefreshCw className="size-4" />} loading={activity.isFetching} onClick={() => void Promise.all([activity.refetch(), ...['dashboard', 'projects', 'cloud'].map(key => qc.invalidateQueries({ queryKey: [key] }))])}>Refresh</Button></div>} />
    <RecentProjects />
    <HomeDashboard />
    <ErrorNote error={activity.error} />
    {selected && <div className="rounded-lg border border-line bg-panel p-5 space-y-3"><div className="flex justify-between gap-4"><h3 className="font-semibold capitalize">{taskLabel(selected)}</h3><button className="text-sm text-muted underline" onClick={() => setSelectedId(undefined)}>Close details</button></div><ActivityDetails job={selected} now={now} projectName={projectName(selected)} />{selected.projectId && <Link className="inline-block text-sm underline" to={selected.documentId ? `/projects/${selected.projectId}/docs/${selected.documentId}` : selected.batchId ? `/projects/${selected.projectId}?action=review-revisions` : `/projects/${selected.projectId}`}>{selected.documentId ? 'Open document' : 'Open project'}</Link>}</div>}
    <div id="home-ai-activity" className="scroll-mt-6 rounded-lg border border-line bg-panel p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">AI activity</h3><div className="flex gap-1" aria-label="Filter activity">{(['all', 'working', 'done', 'error'] as const).map((value) => <button key={value} aria-pressed={filter === value} className={`rounded px-3 py-1 text-xs capitalize ${filter === value ? 'bg-forest text-paper' : 'text-muted'}`} onClick={() => { setFilter(value); setFeedLimit(10) }}>{value === 'all' ? 'All' : labels[value]}</button>)}</div></div>{!filtered.length ? <p className="text-sm text-muted">{activity.isPending ? 'Loading activity...' : jobs.length ? 'No tasks match this filter.' : 'No AI tasks yet. Start a chat, draft a document or run QA to see activity. Activity history is saved across restarts.'}</p> : <div className="space-y-2">{filtered.slice(0, feedLimit).map((job) => <button key={job.id} onClick={() => setSelectedId(job.id)} className="flex w-full flex-wrap items-center gap-3 rounded border border-line px-3 py-3 text-left text-sm"><span className={`activity-dot ${job.status}`} /><span className="min-w-0 flex-1"><span className="block font-medium">{taskLabel(job)}</span><span className="block text-xs text-muted">{projectName(job) ?? 'Workspace'} / {job.status === 'error' ? 'Failed - click for details' : job.detail}</span></span><span className="text-xs text-muted">{job.model ?? 'Preparing'}</span><span className="text-xs">{formatElapsed((job.finishedAt ?? now) - job.startedAt)}</span><span>{labels[job.status]}</span></button>)}{filtered.length > feedLimit && <Button variant="outline" onClick={() => setFeedLimit(v => v + 10)}>Show more activity</Button>}</div>}</div>
  </div>
}
