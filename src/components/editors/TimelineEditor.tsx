import type { TimelineContent, TimelineRow } from '../../../shared/schemas.ts'
import { computeSchedule, weeksCovered } from '../../../shared/timeline.ts'
import { Field, Input, Textarea } from '../ui'
import { TableEditor, type Column } from './TableEditor'

const COLUMNS: Column<TimelineRow>[] = [
  { key: 'no', label: 'No', width: '48px' },
  { key: 'activity', label: 'Activity', width: '15%' },
  { key: 'module', label: 'Module', width: '15%' },
  { key: 'function', label: 'Function' },
  { key: 'pic', label: 'PIC', width: '120px' },
  { key: 'days', label: 'SLA/Days', width: '84px', type: 'number' },
  { key: 'parallel', label: '∥', width: '36px', type: 'checkbox' },
]

const newRow = (): TimelineRow => ({ no: '', activity: '', module: '', function: '', pic: '', days: 1, parallel: false })

export function TimelineEditor({ value, onChange, readOnly }: { value: TimelineContent; onChange: (v: TimelineContent) => void; readOnly?: boolean }) {
  const schedule = computeSchedule(value.rows, value.start_date || undefined)
  const weeks = Math.max(schedule.totalWeeks, 1)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <Field label="Title">
          <Input value={value.title} readOnly={readOnly} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        </Field>
        <Field label="Start date" hint="Working days only (Mon–Fri)">
          <Input type="date" value={value.start_date} readOnly={readOnly} onChange={(e) => onChange({ ...value, start_date: e.target.value })} />
        </Field>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total mandays" value={schedule.totalMandays} />
        <Stat label="IT delivery mandays" value={schedule.itDeliveryMandays} />
        <Stat label="Duration" value={`${schedule.durationDays} days · ${schedule.totalWeeks} wk`} />
        <Stat label="Go-live / end" value={schedule.endDate ?? '—'} />
      </dl>

      <p className="text-xs text-muted">
        <strong>SLA/Days</strong> = mandays you set. Tick <strong>∥</strong> to run a row in parallel with the one above it. <strong>Total mandays</strong> adds up every row
        (parallel ones too); <strong>IT delivery</strong> is the AI Setting and Integration &amp; APIs rows (marked <span className="font-mono">IT</span>); <strong>Duration</strong> is the
        calendar length in working days.
      </p>

      <TableEditor
        columns={COLUMNS}
        rows={value.rows}
        readOnly={readOnly}
        newRow={newRow}
        onChange={(rows) => onChange({ ...value, rows })}
        trailing={{
          width: `${Math.max(150, weeks * 21 + 20)}px`,
          header: (
            <div className="flex gap-px font-mono">
              {Array.from({ length: weeks }, (_, w) => (
                <span key={w} className="w-5 text-center text-[10px]">
                  W{w + 1}
                </span>
              ))}
            </div>
          ),
          cell: (_row, i) => {
            const s = schedule.rows[i]
            const covered = new Set(weeksCovered(s.startDay, s.endDay))
            return (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-px" aria-label={`Weeks ${[...covered].join(', ')}`}>
                  {Array.from({ length: weeks }, (_, w) => (
                    <span key={w} className={`h-4 w-5 rounded-[2px] ${covered.has(w + 1) ? 'bg-ember' : 'bg-line/50'}`} />
                  ))}
                  {s.isItDelivery && (
                    <span className="ml-1 rounded bg-forest-soft px-1 font-mono text-[10px] text-forest" title="Counted in IT delivery mandays">
                      IT
                    </span>
                  )}
                </div>
                {s.startDate && (
                  <span className="font-mono text-[10px] whitespace-nowrap text-muted">
                    {s.startDate} → {s.endDate}
                  </span>
                )}
              </div>
            )
          },
        }}
      />

      <Field label="Keterangan (one per line)">
        <Textarea
          rows={3}
          readOnly={readOnly}
          value={value.notes.join('\n')}
          onChange={(e) => onChange({ ...value, notes: e.target.value.split('\n') })}
        />
      </Field>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</dt>
      <dd className="font-display text-2xl font-semibold">{value}</dd>
    </div>
  )
}
