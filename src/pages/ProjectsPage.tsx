import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Select, Spinner, Textarea } from '../components/ui'
import { projectsApi } from '../lib/api'
import type { ProjectInput } from '../lib/types'

const EMPTY: ProjectInput = { name: '', client_name: '', industry: '', package: 'Enterprise', status: 'discovery', description: '' }

export function ProjectsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<ProjectInput>(EMPTY)
  const projects = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list })

  const create = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${p.id}`)
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    create.mutate({ ...form, name: form.name.trim(), client_name: form.client_name.trim() })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        kicker="Workbench"
        title="Projects"
        actions={
          <Button onClick={() => setCreating((v) => !v)} icon={creating ? <X className="size-4" /> : <Plus className="size-4" />}>
            {creating ? 'Cancel' : 'New project'}
          </Button>
        }
      />

      {creating && (
        <Card className="p-5">
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <Field label="Client name">
              <Input required maxLength={200} value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </Field>
            <Field label="Project name">
              <Input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Industry">
              <Input value={form.industry ?? ''} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Beauty, Insurance, Retail…" />
            </Field>
            <Field label="Package">
              <Select value={form.package ?? ''} onChange={(e) => setForm({ ...form, package: e.target.value })}>
                {['Business', 'Enterprise', 'Unlimited', 'Custom'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Short description">
                <Textarea rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <Button type="submit" loading={create.isPending}>
                Create project
              </Button>
              <ErrorNote error={create.error} />
            </div>
          </form>
        </Card>
      )}

      {projects.isLoading && <Spinner />}
      <ErrorNote error={projects.error} />
      {projects.data?.length === 0 && !creating && (
        <Card className="p-10 text-center">
          <p className="font-display text-2xl">No projects yet.</p>
          <p className="mt-2 text-sm text-muted">Create one, drop in the client's RFP, and let the copilot draft the assessment.</p>
        </Card>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.data?.map((p, i) => (
          <li key={p.id} className={i === 0 ? 'sm:col-span-2 lg:col-span-1 lg:row-span-2' : ''}>
            <Link
              to={`/projects/${p.id}`}
              className="group flex h-full flex-col justify-between gap-6 rounded-xl border border-line bg-panel p-5 transition hover:-translate-y-0.5 hover:border-forest hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,.25)]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <Badge tone={p.status === 'won' ? 'ok' : p.status === 'lost' ? 'warn' : 'forest'}>{p.status}</Badge>
                  <ArrowUpRight className="size-4 text-muted transition group-hover:text-ember" />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">{p.client_name}</p>
                <h2 className={`font-display font-semibold leading-tight ${i === 0 ? 'text-3xl' : 'text-xl'}`}>{p.name}</h2>
                {p.description && <p className="mt-2 line-clamp-3 text-sm text-muted">{p.description}</p>}
              </div>
              <p className="font-mono text-[11px] text-muted">
                {p.package ?? '—'} · updated {new Date(p.updated_at).toLocaleDateString()}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
