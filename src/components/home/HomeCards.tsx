// The Home page cards, built from shadcn/ui (src/components/shadcn) on the app's theme tokens.
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, CheckCircle2, Cloud, NotebookPen, Plus, ScanSearch, Sparkles, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CloudStatus } from '../../../shared/maintenance.ts'
import { PIPELINE } from '../../../shared/schemas.ts'
import type { DashboardRow } from '../../lib/api'
import { Badge } from '@/components/shadcn/badge'
import { Button } from '@/components/shadcn/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Progress } from '@/components/shadcn/progress'
import { ScrollArea } from '@/components/shadcn/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select'
import { Separator } from '@/components/shadcn/separator'
import { Skeleton } from '@/components/shadcn/skeleton'
import { cn } from '@/lib/utils'

export type LoadState = 'loading' | 'error' | 'ready'

const date = (value: string | number) => new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
/** Tinted badges for states shadcn's variants do not cover. */
const tone = { warn: 'border-transparent bg-ember-soft text-warn', ok: 'border-transparent bg-forest-soft text-ok', ai: 'border-transparent bg-accent text-primary' }

export function StatCard({ label, value, icon: Icon, state }: { label: string; value: number; icon: LucideIcon; state: LoadState }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-center gap-4 p-4">
        <span className="rounded-lg bg-accent p-3 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          {state === 'loading' ? <Skeleton className="mb-1 h-7 w-10 bg-accent" /> : <p className="font-display text-3xl leading-none font-semibold">{state === 'error' ? '—' : value}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export interface ResumeTarget {
  title: string
  subtitle: string
  href: string
  label: string
  note?: string
}

export function ContinueCard({ target, state }: { target: ResumeTarget | null; state: LoadState }) {
  const title = target?.title ?? (state === 'loading' ? 'Loading your workspace…' : state === 'error' ? 'Workspace unavailable' : 'Start your first project')
  const subtitle = target?.subtitle ?? (state === 'error' ? 'Refresh Home to reconnect to your project data.' : 'Create a project to collect requirements, draft deliverables and collaborate with AI.')
  return (
    <Card className="relative overflow-hidden border-primary/20 bg-primary text-primary-foreground">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary-foreground/10" />
      <CardHeader>
        <p className="text-xs font-semibold tracking-wider text-primary-foreground/70 uppercase">Continue working</p>
        <CardTitle className="font-display text-2xl leading-tight">{title}</CardTitle>
        <CardDescription className="text-primary-foreground/75">{subtitle}</CardDescription>
        {target?.note && <p className="text-xs text-primary-foreground/60">{target.note}</p>}
      </CardHeader>
      <CardFooter className="mt-auto">
        <Button asChild variant="secondary" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
          <Link to={target?.href ?? '/?create=1'}>
            {target?.label ?? 'Create project'}
            <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function AttentionCard({ projects, total, state }: { projects: DashboardRow[]; total: number; state: LoadState }) {
  const status = state === 'loading' ? 'Checking' : state === 'error' ? 'Unavailable' : plural(total, 'item')
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-5 [.border-b]:pb-5">
        <CardTitle className="text-lg">Needs attention</CardTitle>
        <CardAction>
          <Badge variant="outline" className={cn(total > 0 && tone.warn)}>{status}</Badge>
        </CardAction>
      </CardHeader>
      <ScrollArea className="h-56">
        <div className="space-y-3 p-5">
          {state === 'loading' ? (
            [0, 1].map((i) => <Skeleton key={i} className="h-16 w-full bg-accent" />)
          ) : state === 'error' ? (
            <p className="text-sm text-muted-foreground">Project attention status is unavailable.</p>
          ) : !projects.length ? (
            <p className="flex items-center gap-2 text-sm text-ok">
              <CheckCircle2 className="size-4" /> No outstanding items in active projects.
            </p>
          ) : (
            projects.map((p) => <AttentionRow key={p.id} project={p} />)
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}

function AttentionRow({ project: p }: { project: DashboardRow }) {
  const links = [
    p.review_alerts ? { to: `/projects/${p.id}?tab=deliverables`, text: plural(p.review_alerts, 'item') + ' need review', cls: tone.warn } : null,
    p.open_questions ? { to: `/projects/${p.id}?tab=requirements#project-questions`, text: plural(p.open_questions, 'open question'), cls: '' } : null,
    p.last_check_issues ? { to: `/projects/${p.id}?tab=deliverables`, text: plural(p.last_check_issues, 'consistency issue'), cls: tone.warn } : null,
    p.revision_drafts ? { to: `/projects/${p.id}?tab=requirements&action=review-revisions`, text: plural(p.revision_drafts, 'revision draft'), cls: tone.ai } : null,
  ].filter((l) => l !== null)
  return (
    <div className="rounded-lg border border-border bg-background/60 p-4">
      <Link className="text-sm font-semibold hover:underline" to={`/projects/${p.id}`}>
        {p.name}
      </Link>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <Badge key={l.text} asChild variant="outline" className={cn('px-2.5 py-1', l.cls)}>
            <Link to={l.to}>{l.text}</Link>
          </Badge>
        ))}
      </div>
    </div>
  )
}

const ACTIONS = [
  { label: 'Upload requirements', icon: Upload, action: 'upload' },
  { label: 'Meeting notes', icon: NotebookPen, action: 'meeting' },
  { label: 'AI Enhancement', icon: Sparkles, action: 'enhance' },
] as const

export function QuickActionsCard({ projects, selectedId, onSelect }: { projects: DashboardRow[]; selectedId: string; onSelect: (id: string) => void }) {
  const projectLink = selectedId ? `/projects/${selectedId}` : ''
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quick actions</CardTitle>
        {projects.length > 0 && (
          <CardAction>
            <Select value={selectedId} onValueChange={onSelect}>
              <SelectTrigger aria-label="Project for quick actions" size="sm" className="max-w-[220px]">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-auto justify-start py-3">
          <Link to="/?create=1">
            <Plus className="text-primary" />
            New project
          </Link>
        </Button>
        {ACTIONS.map(({ label, icon: Icon, action }) =>
          projectLink ? (
            <Button key={action} asChild variant="outline" className="h-auto justify-start py-3">
              <Link to={`${projectLink}?tab=requirements&action=${action}`}>
                <Icon className="text-primary" />
                {label}
              </Link>
            </Button>
          ) : (
            <Button key={action} variant="outline" disabled className="h-auto justify-start py-3">
              <Icon />
              {label}
            </Button>
          ),
        )}
      </CardContent>
      {!projects.length && <CardFooter className="text-xs text-muted-foreground">Create a project to enable project actions.</CardFooter>}
    </Card>
  )
}

export function BackupCard({ backup, state }: { backup: CloudStatus | undefined; state: LoadState }) {
  const inSync = backup && backup.localRevision === backup.remoteRevision
  const changeNote =
    backup?.localChangeStatus === 'changed'
      ? 'Local changes since last backup. Upload before switching computers.'
      : backup?.localChangeStatus === 'clean'
        ? 'Your local changes are backed up.'
        : 'Local change status is unknown. Upload once to establish a baseline.'
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Cloud className="size-5 text-primary" />
          Backup status
        </CardTitle>
        {backup?.configured && (
          <CardAction>
            <Badge variant="outline" className={inSync ? tone.ok : tone.warn}>
              {inSync ? 'Revisions match' : 'Download required'}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state === 'loading' ? (
          <Skeleton className="h-16 w-full bg-accent" />
        ) : state === 'error' ? (
          <p className="text-muted-foreground">Cloud status is unavailable.</p>
        ) : !backup?.configured ? (
          <p className="text-muted-foreground">Cloud backup is not configured yet.</p>
        ) : (
          <>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">This computer</dt>
                <dd>Revision {backup.localRevision}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Cloud</dt>
                <dd>Revision {backup.remoteRevision}</dd>
              </div>
            </dl>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">Latest cloud snapshot</p>
              <p className="mt-1">{backup.updatedAt ? date(backup.updatedAt) : 'No cloud snapshot yet'}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{changeNote}</p>
          </>
        )}
      </CardContent>
      <CardFooter className="mt-auto">
        <Button asChild variant="link" className="h-auto px-0">
          <Link to="/settings/backup">
            Manage backups
            <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ProjectOverview({ projects, state }: { projects: DashboardRow[]; state: LoadState }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-5 [.border-b]:pb-5">
        <CardTitle className="text-lg">Project overview</CardTitle>
        <CardAction>
          <Button asChild variant="link" className="h-auto px-0">
            <Link to="/">All projects</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {state === 'loading' ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full bg-accent" />)
        ) : state === 'error' ? (
          <p className="text-sm text-muted-foreground">Project overview is unavailable.</p>
        ) : !projects.length ? (
          <p className="text-sm text-muted-foreground">No active projects yet.</p>
        ) : (
          projects.slice(0, 6).map((p) => <OverviewTile key={p.id} project={p} />)
        )}
      </CardContent>
    </Card>
  )
}

function OverviewTile({ project: p }: { project: DashboardRow }) {
  const percent = Math.min(100, (p.drafted / PIPELINE.length) * 100)
  return (
    <Link
      to={`/projects/${p.id}?tab=deliverables`}
      className="group flex h-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-background/60 p-4 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="line-clamp-2 min-h-10 text-sm font-semibold break-words group-hover:text-primary">{p.name}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{p.client_name}</p>
        </div>
        <Badge variant="secondary" className="capitalize">
          {p.status}
        </Badge>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Deliverables</span>
        <span>
          {p.drafted}/{PIPELINE.length} drafted
        </span>
      </div>
      <Progress value={percent} aria-label={`${p.name} deliverables`} className="h-1.5 bg-secondary" />
      <p className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
        <ScanSearch className="size-3.5" />
        {p.last_check_issues == null ? 'Consistency not checked yet' : plural(p.last_check_issues, 'consistency issue')}
      </p>
    </Link>
  )
}
