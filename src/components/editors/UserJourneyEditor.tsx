import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { UserJourneyContent, UserJourneyScript, UserJourneySection, UserJourneySheet } from '../../../shared/schemas.ts'
import { Button, Field, Input } from '../ui'
import { TableEditor, type Column } from './TableEditor'

const COLUMNS: Column<UserJourneyScript>[] = [
  { key: 'no', label: 'Script No', width: '72px' },
  { key: 'parent', label: 'Parent', width: '84px' },
  { key: 'scenario', label: 'Scenario', width: '14%', type: 'textarea' },
  { key: 'trigger', label: 'Trigger / Condition', width: '16%', type: 'textarea' },
  { key: 'response', label: 'Ekspektasi Respon', type: 'textarea' },
  { key: 'note', label: 'Note', width: '15%', type: 'textarea' },
  { key: 'revision', label: 'Revision History', width: '120px' },
]

const today = () => new Date().toLocaleDateString('en-GB')

/** Next script number in a sheet (numbers run across all its sections, like the template). */
function nextNo(sheet: UserJourneySheet): string {
  const numbers = sheet.sections.flatMap((s) => s.scripts.map((x) => Number.parseInt(x.no, 10))).filter(Number.isFinite)
  return String((numbers.length ? Math.max(...numbers) : 0) + 1)
}

const newSheet = (): UserJourneySheet => ({ name: 'New topic', sections: [{ title: '', scripts: [] }] })

type Props = { value: UserJourneyContent; onChange: (v: UserJourneyContent) => void; readOnly?: boolean }

/** Cekat "Template User Journey Workflows": one tab per topic sheet, blue section rows, scripts in template columns. */
export function UserJourneyEditor({ value, onChange, readOnly }: Props) {
  const [active, setActive] = useState(0)
  const index = Math.min(active, Math.max(0, value.sheets.length - 1))
  const sheet = value.sheets[index]

  const setSheet = (next: UserJourneySheet) => onChange({ ...value, sheets: value.sheets.map((s, i) => (i === index ? next : s)) })
  const setSection = (s: number, next: UserJourneySection) => sheet && setSheet({ ...sheet, sections: sheet.sections.map((x, i) => (i === s ? next : x)) })
  const newScript = (): UserJourneyScript => ({ no: sheet ? nextNo(sheet) : '1', parent: 'random', scenario: '', trigger: '', response: '', note: '', revision: `added ${today()}` })

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <Field label="Title">
          <Input value={value.title} readOnly={readOnly} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        </Field>
        <Field label="AI Agent persona" hint="Name used in the greeting">
          <Input value={value.persona} readOnly={readOnly} onChange={(e) => onChange({ ...value, persona: e.target.value })} placeholder="Clara" />
        </Field>
      </div>

      <p className="text-xs text-muted">
        <strong>Parent</strong>: <code>root</code> = session start, <code>random</code> = reachable from any state, or the parent script number. Write API data as{' '}
        <code>[variable]</code> and buttons as <code>[button] Label</code>.
      </p>

      <div role="tablist" aria-label="Topic sheets" className="flex flex-wrap items-end gap-1 border-b border-line">
        {value.sheets.map((s, i) => (
          <button
            key={`sheet-${i}`}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setActive(i)}
            className={`-mb-px max-w-56 truncate rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${i === index ? 'border-line bg-panel font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {s.name || 'Untitled'}
          </button>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              onChange({ ...value, sheets: [...value.sheets, newSheet()] })
              setActive(value.sheets.length)
            }}
            className="mb-1 ml-1 inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-muted hover:text-ink"
          >
            <Plus className="size-4" /> Sheet
          </button>
        )}
      </div>

      {!sheet ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No topic sheet yet — add one or draft the user journey with AI.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Field label="Sheet name" hint="Max 31 characters (Excel limit)">
                <Input value={sheet.name} maxLength={31} readOnly={readOnly} onChange={(e) => setSheet({ ...sheet, name: e.target.value })} />
              </Field>
            </div>
            {!readOnly && (
              <Button
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                onClick={() => {
                  if (!confirm(`Delete sheet "${sheet.name}"?`)) return
                  onChange({ ...value, sheets: value.sheets.filter((_, i) => i !== index) })
                  setActive(Math.max(0, index - 1))
                }}
              >
                Delete sheet
              </Button>
            )}
          </div>

          {sheet.sections.map((section, s) => (
            <section key={`section-${index}-${s}`} className="space-y-2">
              <div className="flex items-center gap-2 rounded-md bg-[#a4c2f4]/40 px-2 py-1">
                <Input
                  aria-label="Section title"
                  value={section.title}
                  readOnly={readOnly}
                  onChange={(e) => setSection(s, { ...section, title: e.target.value })}
                  placeholder="Section (e.g. Greeting, Main Menu, Followup)"
                  className="border-transparent bg-transparent font-semibold"
                />
                {!readOnly && (
                  <Button variant="ghost" aria-label={`Delete section ${section.title}`} icon={<Trash2 className="size-4" />} onClick={() => setSheet({ ...sheet, sections: sheet.sections.filter((_, i) => i !== s) })} />
                )}
              </div>
              <TableEditor columns={COLUMNS} rows={section.scripts} readOnly={readOnly} newRow={newScript} onChange={(scripts) => setSection(s, { ...section, scripts })} />
            </section>
          ))}
          {!readOnly && (
            <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setSheet({ ...sheet, sections: [...sheet.sections, { title: '', scripts: [] }] })}>
              Add section
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
