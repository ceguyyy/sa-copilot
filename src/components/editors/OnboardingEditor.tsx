import { Plus, Trash2 } from 'lucide-react'
import type { OnboardingContent, OnboardingFieldType } from '../../../shared/schemas.ts'
import { Button, Input, Textarea } from '../ui'
import { TableEditor, type Column } from './TableEditor'

type Section = OnboardingContent['sections'][number]
type FieldRow = Section['fields'][number]
type FieldRowForm = Omit<FieldRow, 'options'> & { options: string }

const TYPES: OnboardingFieldType[] = ['text', 'textarea', 'select', 'checkbox', 'date', 'file']

const COLUMNS: Column<FieldRowForm>[] = [
  { key: 'label', label: 'Field', width: '22%' },
  { key: 'type', label: 'Type', width: '100px', type: 'select', options: TYPES },
  { key: 'required', label: 'Req', width: '44px', type: 'checkbox' },
  { key: 'options', label: 'Options (comma)', width: '16%' },
  { key: 'value', label: 'Pre-filled value', width: '20%' },
  { key: 'help', label: 'Help text' },
]

// Exact round-trip (no trimming) so typing "a, b" is never mangled mid-keystroke.
const toForm = (f: FieldRow): FieldRowForm => ({ ...f, options: f.options.join(',') })
const fromForm = (f: FieldRowForm): FieldRow => ({ ...f, options: f.options === '' ? [] : f.options.split(',') })

export function OnboardingEditor({ value, onChange, readOnly }: { value: OnboardingContent; onChange: (v: OnboardingContent) => void; readOnly?: boolean }) {
  const setSection = (i: number, patch: Partial<Section>) =>
    onChange({ ...value, sections: value.sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })

  return (
    <div className="space-y-8">
      <Input aria-label="Form title" className="font-display text-xl" readOnly={readOnly} value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      {value.sections.map((s, i) => (
        <section key={i} className="space-y-3 border-t border-line pt-5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ember">{String(i + 1).padStart(2, '0')}</span>
            <Input aria-label="Section title" className="flex-1 font-semibold" readOnly={readOnly} value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} />
            {!readOnly && (
              <button aria-label="Delete section" className="p-1 text-muted hover:text-bad" onClick={() => onChange({ ...value, sections: value.sections.filter((_, idx) => idx !== i) })}>
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
          <Textarea rows={2} aria-label="Section description" readOnly={readOnly} value={s.description} onChange={(e) => setSection(i, { description: e.target.value })} />
          <TableEditor
            columns={COLUMNS}
            rows={s.fields.map(toForm)}
            readOnly={readOnly}
            onChange={(rows) => setSection(i, { fields: rows.map(fromForm) })}
            newRow={(): FieldRowForm => ({ label: '', type: 'text', required: false, options: '', help: '', value: '' })}
          />
        </section>
      ))}
      {!readOnly && (
        <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => onChange({ ...value, sections: [...value.sections, { title: 'New section', description: '', fields: [] }] })}>
          Add section
        </Button>
      )}
    </div>
  )
}
