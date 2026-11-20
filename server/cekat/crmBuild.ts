// Builds one POC CRM board in Cekat from scratch: the board and its columns through the dashboard (CrmUi), the
// sample items and the final check through Cekat MCP. Column 1 of the POC is the board key (its name comes from
// "Custom" when the board is created); the blank board's own columns and sample items are removed.
import { CRM_COLUMN_LABELS, hasOptions, type CrmBoard, type CrmColumn } from '../../shared/pocCrm.ts'
import type { CekatCall } from './pocPush.ts'
import type { CrmUi, OptionKind, UiColumn } from './crmUi.ts'

export interface CrmBuildPlan {
  boardName: string
  keyName: string
  columns: { name: string; typeLabel: string; kind: OptionKind; options: string[] }[]
  sampleItems: number
  problems: string[]
}

export interface CrmBuildResult {
  boardId: string
  url: string
  createdItems: number
  problems: string[]
}

type Log = (text: string) => void

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
const dataOf = (text: string): Record<string, unknown>[] => {
  const data = (parse(text) as { data?: unknown } | null)?.data
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
}
const norm = (s: string) => s.trim().toLowerCase()

/** Board names the business already has (crm_list_boards). */
export const boardNames = (text: string) => new Set(dataOf(text).map((b) => norm(String(b.name ?? ''))))

/** What would be built, and why it cannot be (an empty problems list means it can). */
export function planCrmBuild(board: CrmBoard, existing: Set<string>): CrmBuildPlan {
  const [key, ...rest] = board.columns
  const problems: string[] = []
  if (!board.name.trim()) problems.push('The board has no name.')
  else if (existing.has(norm(board.name))) problems.push(`A board named "${board.name}" already exists in this Cekat business. Rename it in the POC or remove the old one first.`)
  if (!key?.name.trim()) problems.push('The board has no columns; column 1 becomes the board key.')
  const seen = new Set<string>()
  for (const c of board.columns) {
    if (!c.name.trim()) problems.push('Every column needs a name.')
    else if (seen.has(norm(c.name))) problems.push(`Column "${c.name}" appears twice; Cekat column names must be unique.`)
    seen.add(norm(c.name))
  }
  for (const c of rest) if (hasOptions(c.type) && !c.options.some((o) => o.label.trim())) problems.push(`${CRM_COLUMN_LABELS[c.type]} column "${c.name}" has no options.`)
  return {
    boardName: board.name.trim(),
    keyName: key?.name.trim() ?? '',
    columns: rest.map((c) => ({ name: c.name.trim(), typeLabel: CRM_COLUMN_LABELS[c.type], kind: c.type === 'dropdown' ? ('dropdown' as const) : ('select' as const), options: hasOptions(c.type) ? c.options.map((o) => o.label.trim()).filter(Boolean) : [] })),
    sampleItems: board.rows.filter((r) => (r[key?.key ?? ''] ?? '').trim()).length,
    problems: [...new Set(problems)],
  }
}

interface CekatColumn { id: string; name: string; type: string; labels: { id: string; name: string }[] }

function cekatColumns(text: string): CekatColumn[] {
  return dataOf(text)
    .filter((c) => typeof c.id === 'string' && !String(c.id).startsWith('__'))
    .map((c) => {
      const labels = (c.settings as { labels?: { id?: unknown; name?: unknown }[] } | null)?.labels
      return { id: String(c.id), name: String(c.name ?? ''), type: String(c.type ?? ''), labels: (Array.isArray(labels) ? labels : []).map((l) => ({ id: String(l.id), name: String(l.name ?? '') })) }
    })
}

/** A sample value in the shape crm_create_item_with_values expects, or undefined to leave the cell empty. */
export function cellValue(column: CrmColumn, raw: string, cekat: CekatColumn | undefined): unknown {
  const v = raw.trim()
  if (!v || !cekat) return undefined
  switch (column.type) {
    case 'text':
    case 'long_text':
    case 'email':
    case 'phone':
      return v
    case 'number':
      return Number.isFinite(Number(v)) ? Number(v) : undefined
    case 'checkbox':
      return v === 'true'
    case 'date':
      return Number.isNaN(Date.parse(v)) ? undefined : new Date(v).toISOString()
    case 'select':
      return cekat.labels.find((l) => norm(l.name) === norm(v))?.id
    case 'dropdown': {
      const ids = v.split(',').map((p) => cekat.labels.find((l) => norm(l.name) === norm(p))?.id).filter((id): id is string => !!id)
      return ids.length ? ids : undefined
    }
    default:
      // Agents, contacts, references and the like point at records that do not exist in a fresh business.
      return undefined
  }
}

/** Every difference between the POC columns and what Cekat now has. */
export function verifyColumns(board: CrmBoard, text: string): string[] {
  const actual = cekatColumns(text)
  const problems: string[] = []
  for (const c of board.columns.slice(1)) {
    const found = actual.find((a) => norm(a.name) === norm(c.name))
    if (!found) {
      problems.push(`Column "${c.name}" is missing in Cekat.`)
      continue
    }
    if (found.type !== c.type) problems.push(`Column "${c.name}" is ${found.type} in Cekat, not ${c.type}.`)
    if (hasOptions(c.type)) {
      const want = c.options.map((o) => o.label.trim()).filter(Boolean)
      const got = found.labels.map((l) => l.name)
      if (want.join('|') !== got.join('|')) problems.push(`Options of "${c.name}" are ${got.join(', ') || 'empty'} in Cekat, expected ${want.join(', ')}.`)
    }
  }
  const extra = actual.filter((a) => !board.columns.some((c) => norm(c.name) === norm(a.name)))
  for (const a of extra) problems.push(`Cekat still has the column "${a.name}"; remove it by hand if it is not needed.`)
  return problems
}

async function replaceSampleItems(call: CekatCall, board: CrmBoard, boardId: string, log: Log): Promise<number> {
  const blankItems = dataOf(await call('crm_list_board_items', { boardId, limit: 200 })).map((i) => String(i.id ?? '')).filter(Boolean)
  if (blankItems.length) {
    await call('crm_delete_items', { boardId, item_ids: blankItems })
    log(`Removed the ${blankItems.length} sample items of the blank board.`)
  }
  const columns = cekatColumns(await call('crm_list_board_columns', { boardId }))
  const [key, ...rest] = board.columns
  let created = 0
  for (const row of board.rows) {
    const name = (row[key.key] ?? '').trim()
    if (!name) continue
    const values = rest
      .map((c) => {
        const cekat = columns.find((a) => norm(a.name) === norm(c.name))
        const value = cellValue(c, row[c.key] ?? '', cekat)
        return value === undefined || !cekat ? null : { column_id: cekat.id, value }
      })
      .filter((v) => v !== null)
    await call('crm_create_item_with_values', { boardId, item: { name }, values })
    created++
  }
  if (created) log(`Added ${created} sample item(s) from the POC.`)
  return created
}

/**
 * Runs the build. Options are set before the blank board's sample items are removed, because the option editor
 * opens from a cell; the blank board's own columns are removed last, after the POC columns exist.
 */
export async function runCrmBuild(ui: CrmUi, call: CekatCall, board: CrmBoard, log: Log): Promise<CrmBuildResult> {
  // Board names come from the dashboard; Cekat MCP's crm_list_boards fails on some businesses.
  const existing = new Set((await ui.boardNames()).map(norm))
  const plan = planCrmBuild(board, existing)
  if (plan.problems.length) throw new Error(plan.problems.join(' '))

  log(`Creating board "${plan.boardName}" with key column "${plan.keyName}"…`)
  const boardId = await ui.createBoard(plan.boardName, plan.keyName)
  const defaults: UiColumn[] = await ui.columns(boardId)

  for (const c of plan.columns) {
    log(`Adding ${c.typeLabel} column "${c.name}"…`)
    const id = await ui.addColumn(c.typeLabel, c.name)
    if (c.options.length) {
      log(`Setting the options of "${c.name}": ${c.options.join(', ')}`)
      const kept = await ui.setOptions(id, c.options, c.kind)
      if (kept.length) log(`Cekat cannot delete Dropdown options here; remove ${kept.join(', ')} from "${c.name}" by hand.`)
    }
  }
  for (const d of defaults) {
    log(`Removing the blank board's column "${d.name}"…`)
    await ui.deleteColumn(d)
  }

  const createdItems = await replaceSampleItems(call, board, boardId, log)
  log('Checking the board in Cekat…')
  const problems = verifyColumns(board, await call('crm_list_board_columns', { boardId }))
  return { boardId, url: `https://chat.cekat.ai/crm?board_id=${boardId}`, createdItems, problems }
}
