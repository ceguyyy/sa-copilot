import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { DIAGRAM_KINDS, type DiagramContent, type DocType } from '../../shared/schemas.ts'
import { skillsApi } from '../lib/api'
import type { GenerateParams } from '../lib/useGenerate'
import { Button, ErrorNote, Field, Select, Textarea } from './ui'

interface Props {
  docType: DocType
  documentId: string
  currentKind?: DiagramContent['kind']
  running: boolean
  chars: number
  /** Current tool activity, e.g. "Searching cekat docs: broadcast". */
  activity?: string
  error: unknown
  dirty: boolean
  onRun: (params: GenerateParams) => void
}

const SUGGESTIONS: Partial<Record<DocType, string[]>> = {
  assessment: ['Terjemahkan ke English', 'Tambahkan pertanyaan terkait SLA & keamanan data'],
  tor: ['Tambahkan integrasi API yang disebut di requirement', 'Ubah paket ke Unlimited'],
  timeline: ['Sesuaikan dengan scope TOR terbaru', 'Hapus aktivitas integrasi API'],
  sow_cekat: ['Update timeline dari dokumen Timeline terbaru', 'Perjelas out of scope'],
  sow_cif: ['Recalculate milestones from the latest timeline', 'Make the objective more measurable'],
  onboarding: ['Tambahkan section untuk integrasi API'],
  diagram: ['Tambahkan jalur eskalasi ke human agent', 'Pecah per swimlane aktor'],
  custom: ['Cek fitur Cekat di dokumentasi dan perbaiki bagian yang tidak akurat', 'Ringkas jadi maksimal 2 halaman'],
}

export function AiPanel({ docType, documentId, currentKind, running, chars, activity, error, dirty, onRun }: Props) {
  const skills = useQuery({ queryKey: ['skills'], queryFn: skillsApi.list })
  const options = skills.data?.filter((s) => s.output_type === docType) ?? []
  const [skillId, setSkillId] = useState('')
  const [instruction, setInstruction] = useState('')
  const [kind, setKind] = useState<string>(currentKind ?? 'activity')

  function run() {
    onRun({ docType, documentId, skillId: skillId || undefined, instruction, diagramKind: docType === 'diagram' ? kind : undefined })
    setInstruction('')
  }

  return (
    <section className="space-y-3 rounded-xl border border-ember/40 bg-ember-soft/40 p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Sparkles className="size-4 text-ember" /> Revise with AI
      </h2>
      <Field label="Skill">
        <Select value={skillId} onChange={(e) => setSkillId(e.target.value)}>
          <option value="">Default skill</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.is_default ? ' ★' : ''}
            </option>
          ))}
        </Select>
      </Field>
      {docType === 'diagram' && (
        <Field label="Diagram kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {DIAGRAM_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Instruction" hint="Empty = regenerate from the latest requirements & documents.">
        <Textarea rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Apa yang mau diubah?" />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS[docType]?.map((s) => (
          <button key={s} onClick={() => setInstruction(s)} className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-muted hover:border-ember hover:text-ember">
            {s}
          </button>
        ))}
      </div>
      {dirty && <p className="text-xs text-warn">You have unsaved edits — save them first, or the AI will revise the last saved version.</p>}
      <Button variant="ai" className="w-full" loading={running} onClick={run} icon={<Sparkles className="size-4" />}>
        {running ? `Writing… ${chars.toLocaleString()} chars` : 'Create new version'}
      </Button>
      {running && activity && (
        <p className="truncate font-mono text-[11px] text-ember" aria-live="polite" title={activity}>
          {activity}
        </p>
      )}
      <ErrorNote error={error} />
    </section>
  )
}
