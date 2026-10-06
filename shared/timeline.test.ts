import { describe, expect, test } from 'vitest'
import type { TimelineRow } from './schemas.ts'
import { addWorkingDays, computeSchedule, weeksCovered } from './timeline.ts'

const row = (days: number, parallel = false, activity = 'a'): TimelineRow => ({
  no: '',
  activity,
  module: '',
  function: '',
  pic: '',
  days,
  parallel,
})

describe('computeSchedule', () => {
  test('places sequential rows back to back', () => {
    const s = computeSchedule([row(7), row(1), row(5)])
    expect(s.rows.map((r) => [r.startDay, r.endDay])).toEqual([
      [0, 7],
      [7, 8],
      [8, 13],
    ])
    expect(s.durationDays).toBe(13)
    expect(s.totalWeeks).toBe(3)
  })

  test('parallel rows start with the previous row and the longest one drives the cursor', () => {
    const s = computeSchedule([row(1), row(5), row(3, true), row(2)])
    expect(s.rows.map((r) => [r.startDay, r.endDay])).toEqual([
      [0, 1],
      [1, 6],
      [1, 4],
      [6, 8],
    ])
    expect(s.durationDays).toBe(8)
  })

  test('treats negative or invalid days as zero', () => {
    const s = computeSchedule([row(-3), row(Number.NaN), row(2)])
    expect(s.durationDays).toBe(2)
    expect(s.rows[2].startDay).toBe(0)
  })

  test('returns zero weeks for an empty timeline', () => {
    expect(computeSchedule([])).toMatchObject({ durationDays: 0, totalWeeks: 0, totalMandays: 0, itDeliveryMandays: 0, rows: [] })
  })

  test('maps working days to calendar dates when a start date is given', () => {
    // 2026-09-28 is a Monday
    const s = computeSchedule([row(5), row(2)], '2026-09-28')
    expect(s.rows[0]).toMatchObject({ startDate: '2026-09-28', endDate: '2026-10-02' })
    expect(s.rows[1]).toMatchObject({ startDate: '2026-10-05', endDate: '2026-10-06' })
    expect(s.endDate).toBe('2026-10-06')
  })
})

describe('addWorkingDays', () => {
  test('skips weekends', () => {
    expect(addWorkingDays('2026-10-02', 1)).toBe('2026-10-05') // Fri + 1 => Mon
  })

  test('moves a weekend start to the next Monday', () => {
    expect(addWorkingDays('2026-10-03', 0)).toBe('2026-10-05') // Sat => Mon
  })
})

describe('weeksCovered', () => {
  test('returns 1-based week numbers touched by a row', () => {
    expect(weeksCovered(3, 12)).toEqual([1, 2, 3])
    expect(weeksCovered(5, 6)).toEqual([2])
  })

  test('returns nothing for zero-length rows', () => {
    expect(weeksCovered(4, 4)).toEqual([])
  })
})

describe('mandays', () => {
  const r = (activity: string, days: number, parallel = false): TimelineRow => ({ no: '', activity, module: '', function: '', pic: '', days, parallel })

  test('total mandays add up every row, parallel ones included, while the duration does not', () => {
    const s = computeSchedule([r('Document Requirement', 7), r('', 7, true), r('Kickoff', 1)])
    expect(s.durationDays).toBe(8)
    expect(s.totalMandays).toBe(15)
  })

  test('IT delivery mandays cover the AI Setting and Integration & APIs activities, including their follow-up rows', () => {
    const s = computeSchedule([
      r('Kickoff Implementation', 1),
      r('AI Setting (Cekat)', 3),
      r('', 3),
      r('', 2, true),
      r('Integration & APIs*', 3),
      r('', 7),
      r('Pre UAT', 1),
      r('', 4),
    ])
    expect(s.itDeliveryMandays).toBe(18)
    expect(s.totalMandays).toBe(24)
  })

  test('marks which rows count as IT delivery', () => {
    const s = computeSchedule([r('AI Setting', 2), r('', 1), r('Go-Live', 1)])
    expect(s.rows.map((x) => x.isItDelivery)).toEqual([true, true, false])
  })
})
