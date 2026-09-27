import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AssistantChat } from '../../components/AssistantChat'
import { Button, Card, ErrorNote, Field, Input, Spinner, Textarea } from '../../components/ui'
import { templatesApi } from '../../lib/api'
import type { DocTemplate, DocTemplateInput } from '../../lib/types'

const BLANK: DocTemplateInput = { name: 'New deliverable', description: '', instructions: '' }

const STARTERS = [
  'Proposal Teknis untuk klien enterprise: ringkasan, arsitektur solusi, integrasi, keamanan data, timeline, asumsi',
  'Business Requirement Document (BRD) dari hasil discovery',
  'UAT plan: skenario uji per fitur, kriteria lulus, PIC',
  'Change request form untuk tambahan scope setelah kickoff',
]

const pick = (t: DocTemplate): DocTemplateInput => ({ name: t.name, description: t.description, instructions: t.instructions })

/** Custom deliverable formats (templates): the AI writes each as meta + markdown sections following the template's instructions. */
export function FormatsSettings() {
  const qc = useQueryClient()
  const templates = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list })
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<DocTemplateInput>(BLANK)

  const selected = templates.data?.find((t) => t.id === selectedId)
  useEffect(() => {
    if (selected) setForm(pick(selected))
  }, [selected?.id, selected?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => qc.invalidateQueries({ queryKey: ['templates'] })

  const save = useMutation({
    mutationFn: () => {
      const input = { ...form, name: form.name.trim() }
      if (!input.name) throw new Error('Name is required')
      return selected ? templatesApi.update(selected.id, input) : templatesApi.create(input)
    },
    onSuccess: (t) => {
      setSelectedId(t.id)
      return invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: () => {
      setSelectedId(null)
      return invalidate()
    },
  })

  function applyProposal(data: Record<string, unknown>) {
    const str = (k: keyof DocTemplateInput) => (typeof data[k] === 'string' ? (data[k] as string) : form[k])
    setForm({ name: str('name'), description: str('description'), instructions: str('instructions') })
    if (!selectedId) setSelectedId('new')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => {
            setSelectedId('new')
            setForm(BLANK)
          }}
        >
          New format
        </Button>
      </div>
      <p className="max-w-3xl text-sm text-muted">
        A template defines a deliverable of your own — its sections, key facts and tone. In a project, pick it under <em>Custom deliverables</em> and the
        AI drafts it from that project&apos;s requirements. The result is edited, versioned and exported (.docx / .md) like any other document.
      </p>
      <ErrorNote error={templates.error} />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-3">
          {templates.isLoading && <Spinner />}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {templates.data?.length === 0 && <li className="p-4 text-sm text-muted">No templates yet — ask the AI to design one.</li>}
            {templates.data?.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full px-3 py-2.5 text-left transition ${selectedId === t.id ? 'bg-forest-soft' : 'hover:bg-forest-soft/50'}`}
                >
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  {t.description && <span className="block truncate text-xs text-muted">{t.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 space-y-6">
          {selectedId ? (
            <Card className="space-y-4 p-5">
              <Field label="Name">
                <Input maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Description" hint="When to use this deliverable.">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label="Instructions (markdown)" hint="Sections in order, what goes in each, which key facts (meta) to fill, language and tone.">
                <Textarea rows={20} className="font-mono text-xs" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
              </Field>
              <ErrorNote error={save.error ?? remove.error} />
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
                  Save
                </Button>
                {selected && (
                  <Button variant="danger" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => confirm(`Delete template "${selected.name}"? Documents made from it are kept.`) && remove.mutate(selected.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <Card className="flex items-center justify-center p-10 text-sm text-muted">Select a template, create one, or describe it to the AI below.</Card>
          )}
          <AssistantChat
            kind="template"
            current={selectedId ? form : {}}
            onProposal={applyProposal}
            placeholder={selectedId ? 'Apa yang mau diubah di template ini?' : 'Deliverable apa yang mau dibuat?'}
            starters={STARTERS}
          />
        </div>
      </div>
    </div>
  )
}
