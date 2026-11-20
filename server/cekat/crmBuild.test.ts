import { describe, expect, it, vi } from 'vitest'
import { boardFromAi } from '../../shared/pocCrm.ts'
import { cellValue, planCrmBuild, runCrmBuild, verifyColumns } from './crmBuild.ts'
import type { CrmUi, UiColumn } from './crmUi.ts'
import type { CekatCall } from './pocPush.ts'

const board = boardFromAi({
  name: 'Leads Klinik',
  description: '',
  columns: [
    { name: 'Phone_number', type: 'text', options: [] },
    { name: 'Phone_number(2)', type: 'phone', options: [] },
    { name: 'Nama', type: 'text', options: [] },
    { name: 'Status', type: 'select', options: [{ label: 'Baru', condition: '' }, { label: 'Booking', condition: 'Pilih slot' }] },
    { name: 'Kunjungan', type: 'date', options: [] },
  ],
  kanbanColumn: 'Status',
  rows: [{ values: ['6281111', '6281111', 'Budi', 'Booking', '2026-11-25'] }, { values: ['', '', 'tanpa key', 'Baru', ''] }],
})

/** Records what the builder does on the dashboard, like a blank Cekat board would answer. */
function fakeUi(boards: string[] = []) {
  const calls: string[] = []
  let n = 0
  const defaults: UiColumn[] = [{ id: 'd1', name: 'Person' }, { id: 'd2', name: 'Status' }, { id: 'd3', name: 'Date' }]
  const ui: CrmUi = {
    boardNames: async () => boards,
    createBoard: async (name, key) => (calls.push(`board ${name} key=${key}`), 'board-1'),
    columns: async () => defaults,
    addColumn: async (type, name) => (calls.push(`add ${type} ${name}`), `c${++n}`),
    setOptions: async (id, labels, kind) => (calls.push(`options ${kind} ${id} ${labels.join('|')}`), []),
    deleteColumn: async (c) => void calls.push(`delete ${c.name}`),
  }
  return { ui, calls }
}

const builtColumns = JSON.stringify({
  data: [
    { id: 'c1', name: 'Phone_number(2)', type: 'phone', settings: null },
    { id: 'c2', name: 'Nama', type: 'text', settings: null },
    { id: 'c3', name: 'Status', type: 'select', settings: { labels: [{ id: 'default', name: 'Baru' }, { id: '1', name: 'Booking' }] } },
    { id: 'c4', name: 'Kunjungan', type: 'date', settings: null },
    { id: '__created_at__', name: 'Created At', type: 'date' },
  ],
})

function fakeCekat(boards: string[] = []) {
  const writes: { tool: string; args: Record<string, unknown> }[] = []
  const call = vi.fn<CekatCall>(async (tool, args) => {
    if (tool === 'crm_list_boards') return JSON.stringify({ data: boards.map((name, i) => ({ id: `b${i}`, name })) })
    if (tool === 'crm_list_board_items') return JSON.stringify({ data: [{ id: 'i1', name: 'Item 1' }, { id: 'i2', name: 'Item 2' }] })
    if (tool === 'crm_list_board_columns') return builtColumns
    writes.push({ tool, args })
    return '{"message":"success"}'
  })
  return { call, writes }
}

describe('planCrmBuild', () => {
  it('uses column 1 as the board key and builds the rest in order', () => {
    const plan = planCrmBuild(board, new Set())
    expect(plan).toMatchObject({ boardName: 'Leads Klinik', keyName: 'Phone_number', sampleItems: 1, problems: [] })
    expect(plan.columns.map((c) => `${c.typeLabel}:${c.name}`)).toEqual(['Phone:Phone_number(2)', 'Text:Nama', 'Select:Status', 'Date:Kunjungan'])
    expect(plan.columns[2].options).toEqual(['Baru', 'Booking'])
  })

  it('refuses an existing board name, duplicate columns and option columns without options', () => {
    const bad = boardFromAi({ name: 'Leads Klinik', columns: [{ name: 'Key', type: 'text' }, { name: 'Key(2)', type: 'text' }, { name: 'Stage', type: 'select', options: [] }, { name: 'stage', type: 'text' }], rows: [] })
    const plan = planCrmBuild(bad, new Set(['leads klinik']))
    expect(plan.problems).toEqual([
      expect.stringContaining('already exists'),
      expect.stringContaining('"stage" appears twice'),
      expect.stringContaining('Select column "Stage" has no options'),
    ])
  })
})

describe('runCrmBuild', () => {
  it('builds the board, sets options before removing the blank defaults, then replaces the sample items', async () => {
    const { ui, calls } = fakeUi()
    const cekat = fakeCekat()
    const result = await runCrmBuild(ui, cekat.call, board, () => {})
    expect(calls).toEqual([
      'board Leads Klinik key=Phone_number',
      'add Phone Phone_number(2)',
      'add Text Nama',
      'add Select Status',
      'options select c3 Baru|Booking',
      'add Date Kunjungan',
      'delete Person',
      'delete Status',
      'delete Date',
    ])
    expect(cekat.writes.map((w) => w.tool)).toEqual(['crm_delete_items', 'crm_create_item_with_values'])
    expect(cekat.writes[0].args).toEqual({ boardId: 'board-1', item_ids: ['i1', 'i2'] })
    expect(cekat.writes[1].args).toEqual({
      boardId: 'board-1',
      item: { name: '6281111' },
      values: [
        { column_id: 'c1', value: '6281111' },
        { column_id: 'c2', value: 'Budi' },
        { column_id: 'c3', value: '1' },
        { column_id: 'c4', value: '2026-11-25T00:00:00.000Z' },
      ],
    })
    expect(result).toEqual({ boardId: 'board-1', url: 'https://chat.cekat.ai/crm?board_id=board-1', createdItems: 1, problems: [] })
  })

  it('stops before touching Cekat when the plan has problems', async () => {
    const { ui, calls } = fakeUi(['Leads Klinik'])
    await expect(runCrmBuild(ui, fakeCekat().call, board, () => {})).rejects.toThrow('already exists')
    expect(calls).toEqual([])
  })
})

describe('verifyColumns', () => {
  it('reports missing columns, wrong types, wrong options and leftovers', () => {
    const text = JSON.stringify({
      data: [
        { id: 'c1', name: 'Phone_number(2)', type: 'text' },
        { id: 'c3', name: 'Status', type: 'select', settings: { labels: [{ id: 'default', name: 'Baru' }] } },
        { id: 'c9', name: 'Person', type: 'agents' },
      ],
    })
    expect(verifyColumns(board, text)).toEqual([
      'Column "Phone_number(2)" is text in Cekat, not phone.',
      'Column "Nama" is missing in Cekat.',
      'Options of "Status" are Baru in Cekat, expected Baru, Booking.',
      'Column "Kunjungan" is missing in Cekat.',
      'Cekat still has the column "Person"; remove it by hand if it is not needed.',
    ])
  })
})

describe('cellValue', () => {
  const col = (type: string) => ({ id: 'x', name: 'x', type, labels: [{ id: 'default', name: 'Baru' }, { id: '2', name: 'VIP' }] })
  it('converts sample values to what the CRM expects, leaving unusable ones empty', () => {
    expect(cellValue({ key: 'k', name: 'n', type: 'number', options: [] }, '1.5', col('number'))).toBe(1.5)
    expect(cellValue({ key: 'k', name: 'n', type: 'number', options: [] }, 'abc', col('number'))).toBeUndefined()
    expect(cellValue({ key: 'k', name: 'n', type: 'checkbox', options: [] }, 'true', col('checkbox'))).toBe(true)
    expect(cellValue({ key: 'k', name: 'n', type: 'dropdown', options: [] }, 'baru, VIP, x', col('dropdown'))).toEqual(['default', '2'])
    expect(cellValue({ key: 'k', name: 'n', type: 'agents', options: [] }, 'Andi', col('agents'))).toBeUndefined()
    expect(cellValue({ key: 'k', name: 'n', type: 'text', options: [] }, 'x', undefined)).toBeUndefined()
  })
})
