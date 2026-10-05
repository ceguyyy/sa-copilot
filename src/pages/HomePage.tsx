import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ErrorNote, PageHeader } from '../components/ui'
import { activityApi, projectsApi } from '../lib/api'
import { ActivityDetails } from '../components/ActivityDetails'
import { taskGroup, taskLabel } from '../lib/activity'
import { formatElapsed } from '../lib/elapsed'
import type { AiActivity } from '../../shared/activity'
import './pixel-office.css'

const colors = ['#f9b567', '#89d5cf', '#c5a4ef', '#ec94a9', '#a8ce83', '#8db7ed']
const labels = { working: 'Working', done: 'Done', error: 'Error' }
function Desk({ job, index, now, selected, onSelect, projectName }: { job?: AiActivity; index: number; now: number; selected: boolean; onSelect: () => void; projectName?: string }) {
  const [dismissed, setDismissed] = useState(false)
  return <button type="button" className={`pixel-desk ${job?.status ?? 'idle'} ${selected ? 'selected' : ''} ${dismissed ? 'tooltip-dismissed' : ''}`} onClick={onSelect} onMouseEnter={() => setDismissed(false)} onFocus={() => setDismissed(false)} onKeyDown={(event) => { if (event.key === 'Escape') setDismissed(true) }} disabled={!job} aria-describedby={job ? `task-${job.id}` : undefined} aria-label={job ? `${taskLabel(job)}: ${labels[job.status]}` : 'Available desk'}>
    <span className="pixel-desk-category">{job ? taskGroup(job) : `DESK ${String(index + 1).padStart(2, '0')}`}</span>
    <span className="pixel-bubble">{job ? job.status === 'working' ? '...' : job.status === 'done' ? 'OK' : '!' : 'z z'}</span>
    <svg viewBox="0 0 96 88" width="144" height="132" shapeRendering="crispEdges" aria-hidden="true">
      <path fill="#33414e" d="M30 66h36v8H30zM34 74h6v12h-6zM56 74h6v12h-6z" />
      <g className="pixel-worker">
        <path fill={colors[index % colors.length]} d="M34 40h28v22H34zM28 46h6v12h-6zM62 46h6v12h-6z" />
        <path fill="#f2c9a0" d="M36 20h24v22H36zM32 24h4v12h-4zM60 24h4v12h-4z" />
        <path fill="#293342" d="M36 16h24v8H36zM32 20h8v10h-8zM56 22h8v8h-8zM40 30h4v4h-4zM52 30h4v4h-4z" />
      </g>
      <path fill="#734d40" d="M8 54h80v8H8zM12 62h6v22h-6zM78 62h6v22h-6z" />
      <path fill="#ba8962" d="M8 50h80v6H8z" />
      <path fill="#273342" d="M32 38h32v20H32zM44 58h8v4h-8z" />
      <path className="pixel-screen" fill={job?.status === 'error' ? '#ee8a92' : job?.status === 'working' ? '#89e6cb' : '#6e879b'} d="M36 42h24v12H36z" />
      <path fill="#273342" d="M40 46h12v2H40zM40 50h8v2h-8z" />
      <path fill="#eee0be" d="M72 42h6v8h-6zM78 44h4v4h-4z" />
    </svg>
    <span className="pixel-desk-name">{job ? taskLabel(job) : 'Available'}</span>
    {job && <><span className="pixel-desk-project">{projectName ?? (job.projectId ? 'Project workspace' : 'Global workspace')}</span><span className="pixel-desk-model">{job.model ?? 'Preparing request'}</span><span className={`pixel-task-stage ${job.status}`}>{job.status === 'error' ? 'Failed - hover for details' : job.detail}</span></>}
    <span className="pixel-desk-status">{job ? `${labels[job.status]} · ${formatElapsed((job.finishedAt ?? now) - job.startedAt)}` : 'Waiting for a task'}</span>
    {job && <span className="pixel-task-tooltip" id={`task-${job.id}`} role="tooltip"><span className="pixel-tooltip-heading">{taskLabel(job)}<span>{labels[job.status]}</span></span><ActivityDetails job={job} now={now} projectName={projectName} compact /><span className="pixel-tooltip-hint">Click to pin full metadata / Esc to dismiss</span></span>}
  </button>
}

export function HomePage() {
  const activity = useQuery({ queryKey: ['ai-activity'], queryFn: activityApi.list, refetchInterval: 2000 })
  const projects = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list })
  const projectName = (job: AiActivity) => projects.data?.find((project) => project.id === job.projectId)?.name
  const [selectedId, setSelectedId] = useState<string>()
  const [now, setNow] = useState(() => Date.now())
  const [filter, setFilter] = useState<'all' | AiActivity['status']>('all')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const jobs = activity.data ?? []
  const working = jobs.filter((job) => job.status === 'working')
  const visible = [...working, ...jobs.filter((job) => job.status !== 'working').slice(0, Math.max(0, 9 - working.length))]
  const desks = Array.from({ length: Math.max(9, visible.length) }, (_, index) => visible[index])
  const selected = jobs.find((job) => job.id === selectedId)
  const filtered = jobs.filter((job) => filter === 'all' || job.status === filter)
  return <div className="space-y-6">
    <PageHeader kicker="Your AI workspace" title="Home" actions={<div className="flex gap-2"><Link to="/" className="rounded-md border border-line px-3 py-1.5 text-sm">Projects</Link><Button variant="outline" icon={<RefreshCw className="size-4" />} loading={activity.isFetching} onClick={() => void activity.refetch()}>Refresh</Button></div>} />
    <ErrorNote error={activity.error} />
    <div className="pixel-office">
      <div className="pixel-office-header"><div><span className="pixel-eyebrow">SA COPILOT / 9ROUTER</span><h2>Pixel workspace</h2></div><span className="pixel-live" role="status">{activity.isError ? 'Disconnected' : activity.isPending ? 'Connecting…' : `${working.length} working · Live`}</span></div>
      <div className="pixel-workspace-stats"><span><b>{working.length}</b> RUNNING</span><span><b>{jobs.filter((job) => job.status === 'done').length}</b> COMPLETED</span><span><b>{jobs.filter((job) => job.status === 'error').length}</b> FAILED</span><span><b>{new Set(working.map((job) => job.model).filter(Boolean)).size}</b> ACTIVE MODELS</span></div>
      <div className="pixel-floor">{desks.map((job, index) => <Desk key={job?.id ?? `empty-${index}`} job={job} index={index} now={now} selected={job?.id === selectedId && !!job} projectName={job ? projectName(job) : undefined} onSelect={() => setSelectedId(job?.id)} />)}</div>
      <div className="pixel-office-footer"><span><i className="pixel-dot" /> Working</span><span>OK Done</span><span>! Error</span><span>Hover or focus for live metadata / Click to pin details</span></div>
    </div>
    {selected && <div className="rounded-lg border border-line bg-panel p-5 space-y-3"><div className="flex justify-between gap-4"><h3 className="font-semibold capitalize">{taskLabel(selected)}</h3><button className="text-sm text-muted underline" onClick={() => setSelectedId(undefined)}>Close details</button></div><ActivityDetails job={selected} now={now} projectName={projectName(selected)} />{selected.projectId && <Link className="inline-block text-sm underline" to={selected.documentId ? `/projects/${selected.projectId}/docs/${selected.documentId}` : `/projects/${selected.projectId}`}>{selected.documentId ? 'Open document' : 'Open project'}</Link>}</div>}
    <div className="rounded-lg border border-line bg-panel p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Activity feed</h3><div className="flex gap-1" aria-label="Filter activity">{(['all', 'working', 'done', 'error'] as const).map((value) => <button key={value} aria-pressed={filter === value} className={`rounded px-3 py-1 text-xs capitalize ${filter === value ? 'bg-forest text-paper' : 'text-muted'}`} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : labels[value]}</button>)}</div></div>{!filtered.length ? <p className="text-sm text-muted">{activity.isPending ? 'Loading activity...' : jobs.length ? 'No tasks match this filter.' : 'Belum ada pekerjaan. Jalankan chat, generate dokumen, atau QA untuk melihat aktivitas. Riwayat tersedia selama server berjalan.'}</p> : <div className="space-y-2">{filtered.slice(0, 20).map((job) => <button key={job.id} onClick={() => setSelectedId(job.id)} className="flex w-full flex-wrap items-center gap-3 rounded border border-line px-3 py-3 text-left text-sm"><span className={`activity-dot ${job.status}`} /><span className="min-w-0 flex-1"><span className="block font-medium">{taskLabel(job)}</span><span className="block text-xs text-muted">{projectName(job) ?? 'Workspace'} / {job.status === 'error' ? 'Failed - click for details' : job.detail}</span></span><span className="text-xs text-muted">{job.model ?? 'Preparing'}</span><span className="text-xs">{formatElapsed((job.finishedAt ?? now) - job.startedAt)}</span><span>{labels[job.status]}</span></button>)}</div>}</div>
  </div>
}
