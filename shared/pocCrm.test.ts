import { describe, expect, it } from 'vitest'
import { CEKAT_CRM_SELECT_RULE, boardFromAi, boardToAi, crmN8nValueGuide, kanbanLanes, nextColumnKey, normalizeCrm, selectOptionValue } from './pocCrm.ts'

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

describe('Cekat CRM select values for n8n', () => {
  const options = [
    { label: 'Invoice', condition: '' },
    { label: 'PO', condition: 'PO issued' },
    { label: 'Delivery', condition: 'Shipped' },
  ]

  it('maps an option to its zero-based position, which is what n8n must send (the first option is 0)', () => {
    expect(selectOptionValue(options, 'Invoice')).toBe(0)
    expect(selectOptionValue(options, 'po')).toBe(1)
    expect(selectOptionValue(options, ' Delivery ')).toBe(2)
    expect(selectOptionValue(options, 'Paid')).toBeNull()
  })

  it('lists the number of every select/dropdown option per board', () => {
    const guide = crmN8nValueGuide({
      boards: [
        {
          name: 'Procurement',
          description: '',
          kanbanColumn: 'c2',
          rows: [],
          columns: [
            { key: 'c1', name: 'Vendor', type: 'text', options: [] },
            { key: 'c2', name: 'Stage', type: 'select', options },
            { key: 'c3', name: 'Priority', type: 'dropdown', options: [{ label: 'Low', condition: '' }, { label: 'High', condition: '' }] },
          ],
        },
        { name: 'Notes', description: '', kanbanColumn: '', rows: [], columns: [{ key: 'c1', name: 'Text', type: 'text', options: [] }] },
      ],
    })
    expect(guide).toBe(
      [
        'Board "Procurement"',
        '- Stage (select): 0 = Invoice, 1 = PO, 2 = Delivery',
        '- Priority (dropdown): 0 = Low, 1 = High',
      ].join('\n'),
    )
  })

  it('is empty when no board has a select or dropdown column', () => {
    expect(crmN8nValueGuide({ boards: [] })).toBe('')
  })

  it('tells the AI that select values start at 0, never at 1', () => {
    expect(CEKAT_CRM_SELECT_RULE).toMatch(/zero-based/i)
    expect(CEKAT_CRM_SELECT_RULE).toMatch(/0 for Invoice, 1 for PO, 2 for Delivery/)
    expect(CEKAT_CRM_SELECT_RULE).not.toMatch(/1-based/)
  })
})

describe('boardToAi', () => {
  it('writes a stored board in the AI shape so boardFromAi reads it back unchanged', () => {
    const board = normalizeCrm({
      boards: [
        {
          name: 'Leads',
          description: 'Semua lead',
          columns: [
            { key: 'c1', name: 'Lead', type: 'text', options: [] },
            { key: 'c2', name: 'Status', type: 'select', options: [{ label: 'Baru', condition: '' }, { label: 'Deal', condition: 'Bayar' }] },
          ],
          rows: [{ c1: 'Budi', c2: 'Deal' }, { c1: 'Sari', c2: '' }],
          kanbanColumn: 'c2',
        },
      ],
    }).boards[0]
    const ai = boardToAi(board)
    expect(ai).toMatchObject({ kanbanColumn: 'Status', rows: [{ values: ['Budi', 'Deal'] }, { values: ['Sari', ''] }] })
    expect(boardFromAi(ai)).toEqual(board)
  })
})
