import type { AssessmentContent, TorContent } from '../../../shared/schemas.ts'
import { Field, Select, Textarea } from '../ui'
import { TableEditor, type Column } from './TableEditor'

type AssessmentRow = AssessmentContent['rows'][number]
type TorRow = TorContent['rows'][number]

const ASSESSMENT_COLUMNS: Column<AssessmentRow>[] = [
  { key: 'no', label: 'No', width: '48px', type: 'number' },
  { key: 'topic', label: 'Topic', width: '12%' },
  { key: 'question', label: 'Assessment Kebutuhan Proses Bisnis', width: '38%' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'status', label: 'Status', width: '150px', type: 'select', options: ['answered', 'needs_confirmation', 'not_applicable'] },
]

export function AssessmentEditor({ value, onChange, readOnly }: { value: AssessmentContent; onChange: (v: AssessmentContent) => void; readOnly?: boolean }) {
  const open = value.rows.filter((r) => r.status === 'needs_confirmation').length
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_140px]">
        <Field label="Summary">
          <Textarea rows={3} readOnly={readOnly} value={value.summary} onChange={(e) => onChange({ ...value, summary: e.target.value })} />
        </Field>
        <Field label="Language">
          <Select disabled={readOnly} value={value.language} onChange={(e) => onChange({ ...value, language: e.target.value as 'id' | 'en' })}>
            <option value="id">Bahasa (ID)</option>
            <option value="en">English (EN)</option>
          </Select>
        </Field>
      </div>
      <p className="text-sm">
        <span className="font-display text-2xl font-semibold text-ember">{open}</span> <span className="text-muted">question(s) need client confirmation</span>
      </p>
      <TableEditor
        columns={ASSESSMENT_COLUMNS}
        rows={value.rows}
        readOnly={readOnly}
        onChange={(rows) => onChange({ ...value, rows })}
        newRow={(): AssessmentRow => ({ no: value.rows.length + 1, topic: '', question: '', feedback: '', status: 'needs_confirmation' })}
      />
    </div>
  )
}

const TOR_COLUMNS: Column<TorRow>[] = [
  { key: 'layanan', label: 'Layanan', width: '14%' },
  { key: 'sub_layanan', label: 'Sub Layanan', width: '20%' },
  { key: 'deskripsi', label: 'Deskripsi' },
  { key: 'note', label: 'Note', width: '20%' },
  { key: 'raised_by', label: 'Raised By', width: '100px' },
]

export function TorEditor({ value, onChange, readOnly }: { value: TorContent; onChange: (v: TorContent) => void; readOnly?: boolean }) {
  return (
    <TableEditor
      columns={TOR_COLUMNS}
      rows={value.rows}
      readOnly={readOnly}
      onChange={(rows) => onChange({ rows })}
      newRow={() => ({ layanan: '', sub_layanan: '', deskripsi: '', note: '', raised_by: 'Cekat' })}
    />
  )
}
