import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, Plus, RotateCcw, Save, Star, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { DOC_LABELS, SKILL_OUTPUT_TYPES, type SkillOutputType } from '../../../shared/schemas.ts'
import { AssistantChat } from '../../components/AssistantChat'
import { ReferenceFiles } from '../../components/ReferenceFiles'
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { skillsApi } from '../../lib/api'
import { DEFAULT_SKILLS } from '../../lib/defaultSkills'
import { downloadBlob, slugify } from '../../lib/download'
import { parseSkillMarkdown, skillToMarkdown } from '../../lib/skillFile'
import type { Skill, SkillInput } from '../../lib/types'
import { useResetState } from '../../lib/useResetState'

const label = (t: SkillOutputType) => (t === 'chat' ? 'Chat persona' : t === 'custom' ? 'Custom deliverables (all)' : DOC_LABELS[t])

const STARTERS = [
  'Buat skill SOW Cekat yang selalu menyebut batasan paket dan SLA dari dokumentasi Cekat',
  'Perbaiki skill ini supaya output lebih ringkas dan pakai bahasa formal',
  'Buat chat persona yang menjawab seperti SA senior dan selalu cek dokumentasi Cekat dulu',
]
const BLANK: SkillInput = { name: 'New skill', output_type: 'assessment', description: '', instructions: '', is_default: false }

export function SkillsSettings() {
  const qc = useQueryClient()
  const skills = useQuery({ queryKey: ['skills'], queryFn: skillsApi.list })
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null)
  const selected = skills.data?.find((s) => s.id === selectedId)
  const [form, setForm] = useResetState<SkillInput>(selected && `${selected.id}:${selected.updated_at}`, () => pick(selected!), BLANK)
  const [filter, setFilter] = useState<SkillOutputType | 'all'>('all')
  const importInput = useRef<HTMLInputElement>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['skills'] })

  /** Only one default per output type. */
  async function clearOtherDefaults(input: SkillInput, exceptId?: string) {
    if (!input.is_default) return
    const others = (skills.data ?? []).filter((s) => s.output_type === input.output_type && s.is_default && s.id !== exceptId)
    await Promise.all(others.map((s) => skillsApi.update(s.id, { is_default: false })))
  }

  const save = useMutation({
    mutationFn: async () => {
      const input = { ...form, name: form.name.trim() }
      if (!input.name || !input.instructions.trim()) throw new Error('Name and instructions are required')
      if (selectedId === 'new' || !selectedId) {
        await clearOtherDefaults(input)
        return skillsApi.create(input)
      }
      await clearOtherDefaults(input, selectedId)
      return skillsApi.update(selectedId, input)
    },
    onSuccess: (s) => {
      setSelectedId(s.id)
      return invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => skillsApi.remove(id),
    onSuccess: () => {
      setSelectedId(null)
      return invalidate()
    },
  })
  const restoreDefaults = useMutation({
    mutationFn: async () => {
      const existing = new Set((skills.data ?? []).map((s) => s.name))
      const missing = DEFAULT_SKILLS.filter((s) => !existing.has(s.name))
      if (missing.length) await skillsApi.createMany(missing.map((s) => ({ ...s, is_default: false })))
      return missing.length
    },
    onSuccess: invalidate,
  })
  const importFile = useMutation({
    mutationFn: async (file: File) => {
      const parsed = parseSkillMarkdown(await file.text())
      return skillsApi.create({ ...parsed, is_default: false })
    },
    onSuccess: (s) => {
      setSelectedId(s.id)
      return invalidate()
    },
  })

  const list = (skills.data ?? []).filter((s) => filter === 'all' || s.output_type === filter)

  /** The AI proposes whole field values; keep the default flag, which is the user's call. */
  function applyProposal(data: Record<string, unknown>) {
    const str = (k: string, fallback: string) => (typeof data[k] === 'string' ? (data[k] as string) : fallback)
    const outputType = SKILL_OUTPUT_TYPES.includes(data.output_type as SkillOutputType) ? (data.output_type as SkillOutputType) : form.output_type
    setForm({
      ...form,
      name: str('name', form.name),
      output_type: outputType,
      description: str('description', form.description),
      instructions: str('instructions', form.instructions),
    })
    if (!selectedId) setSelectedId('new')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" icon={<Upload className="size-4" />} loading={importFile.isPending} onClick={() => importInput.current?.click()}>
          Import .md
        </Button>
        <input
          ref={importInput}
          type="file"
          accept=".md,text/markdown"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importFile.mutate(f)
          }}
        />
        <Button variant="outline" icon={<RotateCcw className="size-4" />} loading={restoreDefaults.isPending} onClick={() => restoreDefaults.mutate()}>
          Restore missing defaults
        </Button>
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => {
            setSelectedId('new')
            setForm(BLANK)
          }}
        >
          New skill
        </Button>
      </div>
      <p className="max-w-3xl text-sm text-muted">
        A skill is the instruction set the AI follows for one output type (a built-in document, every custom format, or chat). The ★ default is used unless you pick another one when generating. Skills export as SKILL.md files usable in Claude Code too.
      </p>
      <ErrorNote error={skills.error ?? importFile.error ?? restoreDefaults.error} />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Select aria-label="Filter by output type" value={filter} onChange={(e) => setFilter(e.target.value as SkillOutputType | 'all')}>
            <option value="all">All output types</option>
            {SKILL_OUTPUT_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </Select>
          {skills.isLoading && <Spinner />}
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {list.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full px-3 py-2.5 text-left transition ${selectedId === s.id ? 'bg-forest-soft' : 'hover:bg-forest-soft/50'}`}
                >
                  <div className="flex items-center gap-2">
                    {s.is_default && <Star className="size-3.5 fill-ember text-ember" aria-label="Default" />}
                    <span className="truncate text-sm font-medium">{s.name}</span>
                  </div>
                  <Badge tone="forest">{label(s.output_type)}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 space-y-6">
        {selectedId ? (
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              <Field label="Name">
                <Input maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Output type">
                <Select value={form.output_type} onChange={(e) => setForm({ ...form, output_type: e.target.value as SkillOutputType })}>
                  {SKILL_OUTPUT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Instructions (markdown)" hint="Sent to Claude as system instructions for this output. Output shape is enforced by the app's JSON schema.">
              <Textarea rows={22} className="font-mono text-xs" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </Field>
            <ReferenceFiles ownerKind="skill" ownerId={selected?.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="accent-[var(--ember)]" />
              Default for {label(form.output_type)}
            </label>
            <ErrorNote error={save.error ?? remove.error} />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
                Save
              </Button>
              {selected && (
                <>
                  <Button
                    variant="outline"
                    icon={<Copy className="size-4" />}
                    onClick={() => {
                      setSelectedId('new')
                      setForm({ ...pick(selected), name: `${selected.name} (copy)`, is_default: false })
                    }}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    icon={<Download className="size-4" />}
                    onClick={() => downloadBlob(new Blob([skillToMarkdown(selected)], { type: 'text/markdown' }), `${slugify(selected.name)}.SKILL.md`)}
                  >
                    Export
                  </Button>
                  <Button variant="danger" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => confirm(`Delete skill "${selected.name}"?`) && remove.mutate(selected.id)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </Card>
        ) : (
          <Card className="flex items-center justify-center p-10 text-sm text-muted">Select a skill to edit, create a new one, or ask the AI below.</Card>
        )}
        <AssistantChat
          kind="skill"
          ownerId={selected?.id}
          current={selectedId ? form : {}}
          onProposal={applyProposal}
          placeholder={selectedId ? 'Apa yang mau diubah di skill ini?' : 'Skill apa yang mau dibuat?'}
          starters={STARTERS}
        />
        </div>
      </div>

    </div>
  )
}

function pick(s: Skill): SkillInput {
  return { name: s.name, output_type: s.output_type, description: s.description, instructions: s.instructions, is_default: s.is_default }
}
