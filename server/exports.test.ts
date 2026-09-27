import { describe, expect, test, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://test@localhost/test'
})

const { safeSegment } = await import('./exports.ts')

describe('safeSegment', () => {
  test('keeps readable names', () => {
    expect(safeSegment('SOW — Cekat')).toBe('SOW — Cekat')
    expect(safeSegment('Xhealth Appointment')).toBe('Xhealth Appointment')
  })

  test('strips characters Windows forbids in file names', () => {
    expect(safeSegment('A/B: "C" <D>?*|')).toBe('A B C D')
    expect(safeSegment('..\\..\\evil')).toBe('.. .. evil')
  })

  test('drops trailing dots/spaces and never returns an empty name', () => {
    expect(safeSegment('Report.  ')).toBe('Report')
    expect(safeSegment('   ')).toBe('Untitled')
  })

  test('avoids reserved device names', () => {
    expect(safeSegment('CON')).toBe('CON_')
    expect(safeSegment('lpt1')).toBe('lpt1_')
  })
})
