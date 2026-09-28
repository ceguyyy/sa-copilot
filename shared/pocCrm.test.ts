import { describe, expect, it } from 'vitest'
import { boardFromAi, kanbanLanes, nextColumnKey, normalizeCrm } from './pocCrm.ts'

describe('normalizeCrm', () => {
  it('turns a legacy stages board into Lead + Status columns with the kanban on Status', () => {
    const crm = normalizeCrm({ boards: [{ name: 'Booking', description: '', stages: [{ name: 'Baru', condition: 'x' }, { name: 'Booked', condition: 'Slot dipilih' }] }] })
    expect(crm.boards[0]).toEqual({
      name: 'Booking',
      description: '',
      columns: [
        { key: 'c1', name: 'Lead', type: 'text', options: [] },
        { key: 'c2', name: 'Status', type: 'select', options: [{ label: 'Baru', condition: '' }, { label: 'Booked', condition: 'Slot dipilih' }] },
      ],
      rows: [],
      kanbanColumn: 'c2',
    })
  })

  it('repairs bad types, duplicate keys, unknown row keys and a kanban on a non-select column', () => {
    const crm = normalizeCrm({
      boards: [
        {
          name: 'Leads',
          columns: [
            { key: 'c1', name: 'Lead', type: 'weird' },
            { key: 'c1', name: 'Status', type: 'select', options: [{ label: 'New' }] },
          ],
          rows: [{ c1: 'David', ghost: 'x' }],
          kanbanColumn: 'c1',
        },
      ],
    })
    const board = crm.boards[0]
    expect(board.columns.map((c) => [c.key, c.type])).toEqual([['c1', 'text'], ['c2', 'select']])
    expect(board.rows).toEqual([{ c1: 'David' }])
    expect(board.kanbanColumn).toBe('c2')
  })

  it('returns no boards for garbage', () => {
    expect(normalizeCrm(undefined)).toEqual({ boards: [] })
    expect(normalizeCrm({ boards: 'x' })).toEqual({ boards: [] })
  })
})

describe('boardFromAi', () => {
  it('keys columns, aligns row values and resolves the kanban column by name', () => {
    const board = boardFromAi({
      name: 'Leads KPR',
      description: 'Prospek KPR',
      columns: [
        { name: 'Lead', type: 'text', options: [] },
        { name: 'Status', type: 'select', options: [{ label: 'New Lead', condition: '' }, { label: 'Qualified', condition: 'Sudah isi data' }] },
        { name: 'Nomor Telepon', type: 'phone', options: [] },
      ],
      kanbanColumn: 'status',
      rows: [{ values: ['David Raditya', 'New Lead', '62818840899'] }],
    })
    expect(board.kanbanColumn).toBe('c2')
    expect(board.rows).toEqual([{ c1: 'David Raditya', c2: 'New Lead', c3: '62818840899' }])
  })
})

describe('kanbanLanes', () => {
  it('groups items by the kanban column and collects unmatched ones under "No status"', () => {
    const board = boardFromAi({
      name: 'B',
      description: '',
      columns: [
        { name: 'Lead', type: 'text', options: [] },
        { name: 'Status', type: 'select', options: [{ label: 'New', condition: '' }, { label: 'Won', condition: 'deal' }] },
      ],
      kanbanColumn: 'Status',
      rows: [{ values: ['A', 'New'] }, { values: ['B', 'Won'] }, { values: ['C', ''] }],
    })
    expect(kanbanLanes(board).map((l) => [l.label, l.rowIndexes])).toEqual([
      ['No status', [2]],
      ['New', [0]],
      ['Won', [1]],
    ])
  })
})

describe('nextColumnKey', () => {
  it('never reuses a key', () => {
    expect(nextColumnKey([{ key: 'c1' }, { key: 'c3' }])).toBe('c4')
    expect(nextColumnKey([])).toBe('c1')
  })
})
