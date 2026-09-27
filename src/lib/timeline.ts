import type { TimelineRow } from '../../supabase/functions/_shared/schemas.ts'

export const WORKING_DAYS_PER_WEEK = 5

export interface ScheduledRow extends TimelineRow {
  /** 0-based working-day index (inclusive) */
  startDay: number
  /** 0-based working-day index (exclusive) */
  endDay: number
  startDate?: string
  endDate?: string
}

export interface Schedule {
  rows: ScheduledRow[]
  totalDays: number
  totalWeeks: number
  endDate?: string
}

const safeDays = (d: number) => (Number.isFinite(d) && d > 0 ? d : 0)

/**
 * Lays timeline rows out on a working-day axis. Rows run back to back unless
 * `parallel` is set, in which case they start together with the previous row.
 */
export function computeSchedule(rows: TimelineRow[], startDate?: string): Schedule {
  let cursor = 0
  const scheduled: ScheduledRow[] = []

  rows.forEach((r, i) => {
    const days = safeDays(r.days)
    const startDay = r.parallel && i > 0 ? scheduled[i - 1].startDay : cursor
    const endDay = startDay + days
    cursor = Math.max(cursor, endDay)
    scheduled.push({
      ...r,
      startDay,
      endDay,
      ...(startDate ? datesFor(startDate, startDay, endDay) : {}),
    })
  })

  return {
    rows: scheduled,
    totalDays: cursor,
    totalWeeks: Math.ceil(cursor / WORKING_DAYS_PER_WEEK),
    ...(startDate && cursor > 0 ? { endDate: addWorkingDays(startDate, cursor - 1) } : {}),
  }
}

function datesFor(base: string, startDay: number, endDay: number) {
  const startDate = addWorkingDays(base, startDay)
  const endDate = endDay > startDay ? addWorkingDays(base, endDay - 1) : startDate
  return { startDate, endDate }
}

/** Adds `n` working days (Mon–Fri) to an ISO date; a weekend start snaps to Monday first. */
export function addWorkingDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const skipWeekend = () => {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  }
  skipWeekend()
  for (let added = 0; added < n; added++) {
    d.setUTCDate(d.getUTCDate() + 1)
    skipWeekend()
  }
  return d.toISOString().slice(0, 10)
}

/** 1-based week numbers a [startDay, endDay) range touches. */
export function weeksCovered(startDay: number, endDay: number): number[] {
  if (endDay <= startDay) return []
  const first = Math.floor(startDay / WORKING_DAYS_PER_WEEK)
  const last = Math.floor((endDay - 1) / WORKING_DAYS_PER_WEEK)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i + 1)
}
