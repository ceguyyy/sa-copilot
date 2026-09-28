import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, RotateCcw, Save, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DOC_LABELS, DOC_SCHEMAS, PIPELINE, type DocType } from '../../../shared/schemas.ts'
import { schemaOutline } from '../../../shared/schemaOutline.ts'
import { AssistantChat } from '../../components/AssistantChat'
import { ReferenceFiles } from '../../components/ReferenceFiles'
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Spinner, Textarea } from '../../components/ui'
import { skillsApi } from '../../lib/api'
import { DEFAULT_SKILLS } from '../../lib/defaultSkills'
import { STEP_HINT } from '../../lib/deliverables'
import type { Skill, SkillInput } from '../../lib/types'

const STARTERS = [
  'Update format ini mengikuti file template terbaru yang saya lampirkan',
  'Buat output lebih ringkas dan pakai bahasa formal',
  'Tambahkan aturan: selalu tandai data yang belum dikonfirmasi klien',
]

/** The skill a deliverable uses when generating: its ★ default, else the most recently updated one. */
function activeSkill(skills: Skill[], type: DocType): Skill | undefined {
  const own = skills.filter((s) => s.output_type === type)
  return own.find((s) => s.is_default) ?? own[0]
}

function builtIn(type: DocType): SkillInput {
  const preset = DEFAULT_SKILLS.find((s) => s.output_type === type && s.is_default) ?? DEFAULT_SKILLS.find((s) => s.output_type === type)
  return preset ? { ...preset, is_default: true } : { name: `${DOC_LABELS[type]} — format`, output_type: type, description: '', instructions: '', is_default: true }
}

const pick = (s: Skill): SkillInput => ({ name: s.name, output_type: s.output_type, description: s.description, instructions: s.instructions, is_default: s.is_default })

/** Built-in deliverables in pipeline order: edit (or have the AI update) the format each one is drafted with. */
export function DeliverablesSettings() {
  const qc = useQueryClient()
  const skills = useQuery({ queryKey: ['skills'], queryFn: skillsApi.list })
  const [type, setType] = useState<DocType>(PIPELINE[0])
  const [skillId, setSkillId] = useState<string | null>(null)
  const [form, setForm] = useState<SkillInput>(() => builtIn(PIPELINE[0]))

  const ofType = useMemo(() => (skills.data ?? []).filter((s) => s.output_type === type), [skills.data, type])
  const selected = ofType.find((s) => s.id === skillId) ?? activeSkill(skills.data ?? [], type)
  const outline = useMemo(() => schemaOutline(DOC_SCHEMAS[type] as never), [type])

  useEffect(() => {
    setForm(selected ? pick(selected) : builtIn(type))
  }, [selected?.id, selected?.updated_at, type]) // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => qc.invalidateQueries({ queryKey: ['skills'] })

  const save = useMutation({
    mutationFn: async () => {
      const input: SkillInput = { ...form, name: form.name.trim(), output_type: type }
      if (!input.name || !input.instructions.trim()) throw new Error('Name and instructions are required')
      // Only one ★ default per deliverable.
      if (input.is_default) await Promise.all(ofType.filter((s) => s.is_default && s.id !== selected?.id).map((s) => skillsApi.update(s.id, { is_default: false })))
      return selected ? skillsApi.update(selected.id, input) : skillsApi.create(input)
    },
    onSuccess: (s) => {
      setSkillId(s.id)
      return invalidate()
    },
  })

  function applyProposal(data: Record<string, unknown>) {
    const str = (k: 'name' | 'description' | 'instructions') => (typeof data[k] === 'string' ? (data[k] as string) : form[k])
    setForm({ ...form, name: str('name'), description: str('description'), instructions: str('instructions') })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
        {PIPELINE.map((t, i) => {
          const skill = activeSkill(skills.data ?? [], t)
          return (
            <li key={t}>
              <button
                type="button"
                onClick={() => {
                  setType(t)
                  setSkillId(null)
                }}
                className={`w-full px-3 py-2.5 text-left transition ${type === t ? 'bg-forest-soft' : 'hover:bg-forest-soft/50'}`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ember">0{i + 1}</span>
                  <span className="truncate text-sm font-medium">{DOC_LABELS[t]}</span>
                </span>
                <span className="mt-1 block truncate text-xs text-muted">{skill ? skill.name : 'Built-in format (not saved yet)'}</span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="min-w-0 space-y-6">
        {skills.isLoading ? (
          <Spinner />
        ) : (
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-semibold">{DOC_LABELS[type]}</h3>
                <p className="text-sm text-muted">{STEP_HINT[type]}</p>
              </div>
              {ofType.length > 1 && (
                <Select aria-label="Format version" value={selected?.id ?? ''} onChange={(e) => setSkillId(e.target.value)} className="w-64">
                  {ofType.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.is_default ? '★ ' : ''}
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="rounded-lg border border-line bg-paper p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                <Lock className="size-3.5" /> Fixed output structure
              </p>
              <ul className="space-y-1 font-mono text-[11px] text-ink">
                {outline.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">The fields and table columns are set by the app (they drive the editor and the .xlsx/.docx export). The instructions below decide what goes in them.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <Input maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Description">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
            <Field label="Format & instructions (markdown)" hint="Sections, wording, rules and tone the AI follows when it drafts this deliverable.">
              <Textarea rows={18} className="font-mono text-xs" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </Field>
            {selected ? (
              <ReferenceFiles ownerKind="skill" ownerId={selected.id} />
            ) : (
              <p className="text-xs text-muted">Save once to attach reference files (e.g. the latest template .xlsx/.docx) the AI reads when drafting.</p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="accent-[var(--ember)]" />
              <Star className="size-3.5 text-ember" /> Use this format when drafting {DOC_LABELS[type]}
            </label>
            <ErrorNote error={skills.error ?? save.error} />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
                Save format
              </Button>
              <Button
                variant="outline"
                icon={<RotateCcw className="size-4" />}
                onClick={() => confirm('Replace the instructions with the built-in format? (Not saved until you press Save.)') && setForm({ ...builtIn(type), name: form.name, is_default: form.is_default })}
              >
                Reset to built-in
              </Button>
              {selected && <Badge tone="forest">updated {new Date(selected.updated_at).toLocaleDateString()}</Badge>}
            </div>
          </Card>
        )}

        <AssistantChat
          kind="skill"
          ownerId={selected?.id}
          current={{ ...form, output_type: type, fixed_output_structure: outline }}
          onProposal={applyProposal}
          title="Update format with AI"
          placeholder={`Apa yang berubah di format ${DOC_LABELS[type]}? Lampirkan template terbaru bila ada.`}
          starters={STARTERS}
        />
      </div>
    </div>
  )
}
