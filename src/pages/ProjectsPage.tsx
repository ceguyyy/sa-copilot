import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, ErrorNote, Field, Input, PageHeader, Select, Spinner, Textarea } from '../components/ui'
import { projectsApi } from '../lib/api'
import { LanguageSelect } from '../components/LanguageSelect'
import { PipelineDashboard } from '../components/PipelineDashboard'
import type { ProjectInput } from '../lib/types'

const EMPTY: ProjectInput = { name: '', client_name: '', industry: '', package: 'Enterprise', status: 'discovery', description: '', language: '' }

export function ProjectsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [creating, setCreating] = useState(() => params.get('create') === '1')
  const [form, setForm] = useState<ProjectInput>(EMPTY)
  const projects = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list })

  const create = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
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
        kicker="Pipeline"
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
            <Field label="Language" hint="The AI writes this project's documents and replies in it. Manage the list in Settings → Languages.">
              <LanguageSelect value={form.language} onChange={(language) => setForm({ ...form, language })} />
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

      <PipelineDashboard />
    </div>
  )
}
