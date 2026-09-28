// Cekat CRM structure for a POC. A board is a table (typed columns + items); the kanban is a view of the same
// board, grouped by one Select/Dropdown column whose options are the lanes.

export const CRM_COLUMN_TYPES = [
  'text',
  'number',
  'date',
  'timeline',
  'email',
  'phone',
  'long_text',
  'checkbox',
  'select',
  'dropdown',
  'references',
  'agents',
  'contacts',
  'companies',
  'conversation',
  'orders',
  'subscriptions',
  'files',
] as const

export type CrmColumnType = (typeof CRM_COLUMN_TYPES)[number]

export const CRM_COLUMN_LABELS: Record<CrmColumnType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  timeline: 'Timeline',
  email: 'Email',
  phone: 'Phone',
  long_text: 'Long Text',
  checkbox: 'Checkbox',
  select: 'Select',
  dropdown: 'Dropdown',
  references: 'References',
  agents: 'Agents',
  contacts: 'Contacts',
  companies: 'Companies',
  conversation: 'Conversation',
  orders: 'Orders',
  subscriptions: 'Subscriptions',
  files: 'Files',
}

export interface CrmOption {
  label: string
  /** When an item moves into this option (used for the kanban/status column); empty for the first one. */
  condition: string
}

export interface CrmColumn {
  /** Stable id within the board; row values are keyed by it. */
  key: string
  name: string
  type: CrmColumnType
  options: CrmOption[]
}

export interface CrmBoard {
  name: string
  description: string
  columns: CrmColumn[]
  /** Sample items: column key → cell value (checkbox cells are "true"/"false"). */
  rows: Record<string, string>[]
  /** Key of the Select/Dropdown column the kanban is grouped by ('' = no kanban). */
  kanbanColumn: string
}

export interface PocCrm {
  boards: CrmBoard[]
}

export const hasOptions = (type: CrmColumnType): boolean => type === 'select' || type === 'dropdown'

const isType = (v: unknown): v is CrmColumnType => typeof v === 'string' && (CRM_COLUMN_TYPES as readonly string[]).includes(v)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])

/** Next unused column key ("c1", "c2", …). */
export function nextColumnKey(columns: Pick<CrmColumn, 'key'>[]): string {
  const used = new Set(columns.map((c) => c.key))
  let n = columns.length + 1
  while (used.has(`c${n}`)) n++
  return `c${n}`
}

function toOptions(v: unknown): CrmOption[] {
  return records(v).map((o, i) => ({ label: text(o.label, 80), condition: i === 0 ? '' : text(o.condition, 2_000) }))
}

/** The kanban column must be a Select/Dropdown column; otherwise fall back to the first one (or none). */
function resolveKanban(requested: string, columns: CrmColumn[]): string {
  const withOptions = columns.filter((c) => hasOptions(c.type))
  return withOptions.find((c) => c.key === requested)?.key ?? withOptions[0]?.key ?? ''
}

/** A board saved before columns existed only had ordered stages: they become a Status select column. */
function fromLegacy(b: Record<string, unknown>): CrmBoard {
  const columns: CrmColumn[] = [
    { key: 'c1', name: 'Lead', type: 'text', options: [] },
    { key: 'c2', name: 'Status', type: 'select', options: records(b.stages).map((s, i) => ({ label: text(s.name, 80), condition: i === 0 ? '' : text(s.condition, 2_000) })) },
  ]
  return { name: text(b.name, 120), description: text(b.description, 2_000), columns, rows: [], kanbanColumn: 'c2' }
}

function normalizeBoard(b: Record<string, unknown>): CrmBoard {
  if (!Array.isArray(b.columns) && Array.isArray(b.stages)) return fromLegacy(b)
  const columns: CrmColumn[] = []
  for (const c of records(b.columns)) {
    const key = text(c.key, 20).trim() || nextColumnKey(columns)
    columns.push({
      key: columns.some((x) => x.key === key) ? nextColumnKey(columns) : key,
      name: text(c.name, 120),
      type: isType(c.type) ? c.type : 'text',
      options: toOptions(c.options),
    })
  }
  const keys = new Set(columns.map((c) => c.key))
  const rows = records(b.rows).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => keys.has(k)).map(([k, v]) => [k, text(v, 5_000)])))
  return { name: text(b.name, 120), description: text(b.description, 2_000), columns, rows, kanbanColumn: resolveKanban(text(b.kanbanColumn, 20), columns) }
}

/** Any stored/incoming CRM value (current or legacy shape, partial or garbage) as a valid CRM structure. */
export function normalizeCrm(raw: unknown): PocCrm {
  const boards = raw && typeof raw === 'object' ? (raw as { boards?: unknown }).boards : undefined
  return { boards: records(boards).map(normalizeBoard) }
}

/** Maps the AI's board (columns by name, rows as values in column order) onto the stored shape. */
export function boardFromAi(raw: Record<string, unknown>): CrmBoard {
  const columns: CrmColumn[] = records(raw.columns).map((c, i) => ({
    key: `c${i + 1}`,
    name: text(c.name, 120),
    type: isType(c.type) ? c.type : 'text',
    options: toOptions(c.options),
  }))
  const rows = records(raw.rows).map((r) => {
    const values = Array.isArray(r.values) ? r.values : []
    return Object.fromEntries(columns.map((c, i) => [c.key, text(values[i], 5_000)]))
  })
  const wanted = text(raw.kanbanColumn, 120).trim().toLowerCase()
  const byName = columns.find((c) => hasOptions(c.type) && c.name.trim().toLowerCase() === wanted)?.key ?? ''
  return { name: text(raw.name, 120), description: text(raw.description, 2_000), columns, rows, kanbanColumn: resolveKanban(byName, columns) }
}

export interface KanbanLane {
  label: string
  condition: string
  rowIndexes: number[]
}

/** Kanban lanes of a board: one per option of the kanban column, plus "No status" for items without a matching value. */
export function kanbanLanes(board: CrmBoard): KanbanLane[] {
  const column = board.columns.find((c) => c.key === board.kanbanColumn)
  if (!column) return []
  const lanes: KanbanLane[] = column.options.map((o) => ({ label: o.label, condition: o.condition, rowIndexes: [] }))
  const unassigned: number[] = []
  board.rows.forEach((row, i) => {
    const lane = lanes.find((l) => l.label && l.label === row[column.key])
    if (lane) lane.rowIndexes.push(i)
    else unassigned.push(i)
  })
  return unassigned.length ? [{ label: 'No status', condition: '', rowIndexes: unassigned }, ...lanes] : lanes
}
