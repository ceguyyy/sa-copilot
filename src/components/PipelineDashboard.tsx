import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, ArrowUpRight, HelpCircle, Trophy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PIPELINE } from '../../shared/schemas.ts'
import { dashboardApi, type DashboardRow } from '../lib/api'
import { PROJECT_STATUSES, type ProjectStatus } from '../lib/types'
import { Badge, Card, ErrorNote, Spinner } from './ui'

const ACTIVE: ProjectStatus[] = ['discovery', 'assessment', 'proposal', 'delivery']

function relative(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString()
}

function Stat({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-muted uppercase">
        {icon} {label}
      </p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** Win rate overall and for the industry with the most closed deals. */
function winRate(rows: DashboardRow[]) {
  const closed = rows.filter((r) => r.status === 'won' || r.status === 'lost')
  const won = closed.filter((r) => r.status === 'won').length
  const byIndustry = new Map<string, { won: number; closed: number }>()
  for (const r of closed) {
    const key = r.industry?.trim() || 'Other'
    const s = byIndustry.get(key) ?? { won: 0, closed: 0 }
    byIndustry.set(key, { won: s.won + (r.status === 'won' ? 1 : 0), closed: s.closed + 1 })
  }
  const top = [...byIndustry].sort((a, b) => b[1].closed - a[1].closed)[0]
  return {
    rate: closed.length ? Math.round((won / closed.length) * 100) : null,
    won,
    closed: closed.length,
    top: top ? `${top[0]}: ${Math.round((top[1].won / top[1].closed) * 100)}% of ${top[1].closed}` : undefined,
  }
}

/** Pipeline overview: deals per status, win rate, and every project's progress at a glance. */
export function PipelineDashboard() {
  const rows = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.get })
  const [status, setStatus] = useState<ProjectStatus | 'active' | 'all'>('all')

  if (rows.isLoading) return <Spinner />
  if (rows.error) return <ErrorNote error={rows.error} />
  const all = rows.data ?? []
  if (!all.length) return null

  const win = winRate(all)
  const openQuestions = all.reduce((n, r) => n + r.open_questions, 0)
  const active = all.filter((r) => ACTIVE.includes(r.status))
  const shown = status === 'all' ? all : status === 'active' ? active : all.filter((r) => r.status === status)
  const maxPerStatus = Math.max(1, ...PROJECT_STATUSES.map((s) => all.filter((r) => r.status === s).length))

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active deals" value={String(active.length)} hint={`${all.length} projects in total`} />
        <Stat label="Win rate" icon={<Trophy className="size-3" />} value={win.rate === null ? '—' : `${win.rate}%`} hint={win.closed ? `${win.won} won of ${win.closed} closed${win.top ? ` · ${win.top}` : ''}` : 'No closed deals yet'} />
        <Stat label="Open questions" icon={<HelpCircle className="size-3" />} value={String(openQuestions)} hint="Waiting for client answers" />
        <Stat
          label="Deliverables"
          value={`${all.reduce((n, r) => n + r.drafted, 0)}/${all.length * PIPELINE.length}`}
          hint="Built-in documents drafted across projects"
        />
      </div>

      {/* Funnel: click a stage to filter the cards below. */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6" role="tablist" aria-label="Filter by status">
        {PROJECT_STATUSES.map((s) => {
          const n = all.filter((r) => r.status === s).length
          const selected = status === s
          return (
            <button
              key={s}
              role="tab"
              aria-selected={selected}
              onClick={() => setStatus(selected ? 'all' : s)}
              className={clsx('rounded-lg border p-2 text-left transition', selected ? 'border-forest bg-forest text-paper' : 'border-line bg-panel hover:border-forest/50')}
            >
              <span className={clsx('block text-xs capitalize', selected ? 'text-paper/80' : 'text-muted')}>{s}</span>
              <span className="block font-display text-xl font-semibold">{n}</span>
              <span className={clsx('mt-1 block h-1 rounded-full', selected ? 'bg-paper/30' : 'bg-line')}>
                <span className={clsx('block h-full rounded-full', s === 'lost' ? 'bg-bad' : s === 'won' ? 'bg-ok' : 'bg-ember')} style={{ width: `${(n / maxPerStatus) * 100}%` }} />
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {status === 'all' ? 'All projects' : status === 'active' ? 'Active projects' : `Status: ${status}`} · {shown.length}
        </p>
        {status !== 'all' && (
          <button className="text-xs text-forest hover:underline" onClick={() => setStatus('all')}>
            Show all
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">No projects in this stage.</Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="group flex h-full flex-col justify-between gap-4 rounded-xl border border-line bg-panel p-5 transition hover:-translate-y-0.5 hover:border-forest hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,.25)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={p.status === 'won' ? 'ok' : p.status === 'lost' ? 'warn' : 'forest'}>{p.status}</Badge>
                    <ArrowUpRight className="size-4 text-muted transition group-hover:text-ember" />
                  </div>
                  <p className="mt-3 text-xs font-semibold tracking-wider text-muted uppercase">{p.client_name}</p>
                  <h2 className="font-display text-xl leading-tight font-semibold">{p.name}</h2>
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between font-mono text-[11px] text-muted">
                      <span>Deliverables</span>
                      <span>
                        {p.drafted}/{PIPELINE.length}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-line">
                      <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${(p.drafted / PIPELINE.length) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.open_questions > 0 && (
                      <Badge tone="ember">
                        {p.open_questions} open Q
                      </Badge>
                    )}
                    {p.last_check_issues !== null && p.last_check_issues > 0 && (
                      <Badge tone="warn">
                        <AlertTriangle className="mr-1 size-3" /> {p.last_check_issues} issues
                      </Badge>
                    )}
                    {p.custom_docs > 0 && <Badge>{p.custom_docs} custom</Badge>}
                    {p.diagrams > 0 && <Badge>{p.diagrams} diagrams</Badge>}
                  </div>
                  <p className="font-mono text-[11px] text-muted">
                    {p.package ?? '—'} · {p.industry || 'industry n/a'} · {relative(p.last_activity)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
