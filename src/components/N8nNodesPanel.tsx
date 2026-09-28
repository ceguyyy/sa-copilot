import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Plus, Trash2, Workflow } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { n8nNodesApi } from '../lib/api'
import type { N8nNodeKind, N8nNodeSkill, N8nNodeSkillInput } from '../lib/types'
import { Badge, Button, ErrorNote, Field, Input, Select, Textarea } from './ui'

const EMPTY_FORM = { name: '', node_type: 'n8n-nodes-base.cekatCrm', kind: 'action' as N8nNodeKind, description: '', example: '{}' }
type Form = typeof EMPTY_FORM

function parseExample(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Example must be a JSON object (one n8n node)')
  return parsed as Record<string, unknown>
}

/** Global catalog of Cekat n8n nodes the AI uses as knowledge when it designs n8n workflows. */
export function N8nNodesPanel() {
  const qc = useQueryClient()
  const nodes = useQuery({ queryKey: ['n8n-nodes'], queryFn: n8nNodesApi.list })
  const [workflowJson, setWorkflowJson] = useState('')
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['n8n-nodes'] })

  const importWorkflow = useMutation({
    mutationFn: () => n8nNodesApi.importWorkflow(workflowJson),
    onSuccess: () => {
      setWorkflowJson('')
      return refresh()
    },
  })
  const save = useMutation({
    mutationFn: () => {
      const input: N8nNodeSkillInput = { ...form, name: form.name.trim(), node_type: form.node_type.trim(), example: parseExample(form.example) }
      return editingId ? n8nNodesApi.update(editingId, input) : n8nNodesApi.create(input)
    },
    onSuccess: () => {
      setForm(EMPTY_FORM)
      setEditingId(null)
      return refresh()
    },
  })
  const remove = useMutation({ mutationFn: (id: string) => n8nNodesApi.remove(id), onSuccess: refresh })

  const edit = (n: N8nNodeSkill) => {
    setEditingId(n.id)
    setForm({ name: n.name, node_type: n.node_type, kind: n.kind, description: n.description, example: JSON.stringify(n.example, null, 2) })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.name.trim() && form.node_type.trim()) save.mutate()
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Workflow className="size-5 text-ember" /> Cekat n8n nodes
        </h2>
        <p className="max-w-3xl text-sm text-muted">
          Node names, node types, triggers and example JSON from workflows.cekat.ai. Every project's AI gets this catalog, so POC drafts and n8n
          workflows use the real Cekat nodes and parameters. Credential ids are stripped on import.
        </p>
      </div>
      <ErrorNote error={nodes.error ?? importWorkflow.error ?? save.error ?? remove.error} />

      <div className="space-y-2 rounded-lg border border-line bg-panel p-4">
        <Field label="Import from an n8n workflow" hint="In n8n: select nodes → Copy, or ⋯ → Download, then paste the JSON here.">
          <Textarea rows={5} className="font-mono text-xs" value={workflowJson} onChange={(e) => setWorkflowJson(e.target.value)} placeholder='{ "name": "…", "nodes": [ … ] }' />
        </Field>
        <div className="flex justify-end">
          <Button variant="outline" icon={<Download className="size-4" />} loading={importWorkflow.isPending} disabled={!workflowJson.trim()} onClick={() => importWorkflow.mutate()}>
            Import nodes
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
        {nodes.data?.length === 0 && <li className="p-4 text-sm text-muted">No nodes yet — import a workflow above or add one below.</li>}
        {nodes.data?.map((n) => (
          <li key={n.id} className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.name}</p>
                <p className="truncate font-mono text-[11px] text-muted">{n.node_type}</p>
              </div>
              <Badge tone={n.kind === 'trigger' ? 'ember' : 'forest'}>{n.kind}</Badge>
              <Button variant="ghost" aria-label={`Edit ${n.name}`} icon={<Pencil className="size-4" />} onClick={() => edit(n)} />
              <Button variant="danger" aria-label={`Delete ${n.name}`} icon={<Trash2 className="size-4" />} onClick={() => confirm(`Delete "${n.name}"?`) && remove.mutate(n.id)} />
            </div>
            {n.description && <p className="mt-2 text-sm text-muted">{n.description}</p>}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">Example JSON</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-paper p-2 font-mono text-[11px]">{JSON.stringify(n.example, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-line bg-panel p-4">
        <h3 className="font-display text-base font-semibold">{editingId ? 'Edit node' : 'Add a node manually'}</h3>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px]">
          <Field label="Node name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Get all boards" />
          </Field>
          <Field label="Node type">
            <Input className="font-mono" value={form.node_type} onChange={(e) => setForm({ ...form, node_type: e.target.value })} placeholder="n8n-nodes-base.cekatCrm" />
          </Field>
          <Field label="Kind">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as N8nNodeKind })}>
              <option value="action">Action</option>
              <option value="trigger">Trigger</option>
            </Select>
          </Field>
        </div>
        <Field label="When to use it">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Lists every CRM board, e.g. to find a board id before creating a card" />
        </Field>
        <Field label="Example node JSON">
          <Textarea rows={6} className="font-mono text-xs" value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          {editingId && (
            <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY_FORM) }}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="outline" icon={<Plus className="size-4" />} loading={save.isPending} disabled={!form.name.trim() || !form.node_type.trim()}>
            {editingId ? 'Save node' : 'Add node'}
          </Button>
        </div>
      </form>
    </section>
  )
}
