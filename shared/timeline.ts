import type { TimelineRow } from './schemas.ts'

export const WORKING_DAYS_PER_WEEK = 5

export interface ScheduledRow extends TimelineRow {
  /** 0-based working-day index (inclusive) */
  startDay: number
  /** 0-based working-day index (exclusive) */
  endDay: number
  startDate?: string
  endDate?: string
  /** Row belongs to an IT delivery activity (AI Setting, Integration & APIs). */
  isItDelivery: boolean
}

export interface Schedule {
  rows: ScheduledRow[]
  /** Calendar length in working days: parallel rows overlap, so this is shorter than the mandays. */
  durationDays: number
  totalWeeks: number
  /** Effort: every row's SLA/Days, parallel rows included. */
  totalMandays: number
  /** Effort of the IT delivery activities only (AI Setting + Integration & APIs in the template). */
  itDeliveryMandays: number
  endDate?: string
}

/** Activities whose rows count as IT delivery, matched on the Activity name (e.g. "AI Setting (Cekat)", "Integration & APIs*"). */
const IT_DELIVERY_ACTIVITIES = [/\bai\s*setting/i, /\bintegrat/i]

export const isItDeliveryActivity = (activity: string): boolean => IT_DELIVERY_ACTIVITIES.some((re) => re.test(activity))

const safeDays = (d: number) => (Number.isFinite(d) && d > 0 ? d : 0)

/**
 * Lays timeline rows out on a working-day axis. Rows run back to back unless
 * `parallel` is set, in which case they start together with the previous row.
 */
export function computeSchedule(rows: TimelineRow[], startDate?: string): Schedule {
  let cursor = 0
  // Only the first row of an activity carries its name; the rows below it belong to the same activity.
  let activity = ''
  const scheduled: ScheduledRow[] = []

  rows.forEach((r, i) => {
    if (r.activity.trim()) activity = r.activity
    const days = safeDays(r.days)
    const startDay = r.parallel && i > 0 ? scheduled[i - 1].startDay : cursor
    const endDay = startDay + days
    cursor = Math.max(cursor, endDay)
    scheduled.push({
      ...r,
      startDay,
      endDay,
      ...(startDate ? datesFor(startDate, startDay, endDay) : {}),
      isItDelivery: isItDeliveryActivity(activity),
    })
  })

  const sumDays = (list: ScheduledRow[]) => list.reduce((sum, r) => sum + safeDays(r.days), 0)
  return {
    rows: scheduled,
    durationDays: cursor,
    totalWeeks: Math.ceil(cursor / WORKING_DAYS_PER_WEEK),
    totalMandays: sumDays(scheduled),
    itDeliveryMandays: sumDays(scheduled.filter((r) => r.isItDelivery)),
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
