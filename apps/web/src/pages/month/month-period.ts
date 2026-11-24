import { currentLocale } from '@/i18n/language'
import { today } from '@/lib/format'

// A calendar month as the dates the API asks for, plus the stretch of the month before it that
// is fair to compare with: the same number of days, so a half-finished month isn't measured
// against a whole one.

export type MonthPeriod = {
  month: string // "2026-11"
  label: string // "November", or "November 2025" in another year
  shortLabel: string // "November"
  isCurrent: boolean
  dateFrom: string
  dateTo: string
  previous: { month: string; label: string; shortLabel: string; dateFrom: string; dateTo: string }
  next: string | null // null for the current month: the future has no numbers yet
}

const pad = (number: number) => String(number).padStart(2, '0')
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`
const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate()
const shift = (year: number, month: number, by: number) => {
  const moment = new Date(year, month - 1 + by, 1)
  return { year: moment.getFullYear(), month: moment.getMonth() + 1 }
}

function monthLabel(year: number, month: number, withYear: boolean): string {
  return new Intl.DateTimeFormat(currentLocale(), withYear ? { month: 'long', year: 'numeric' } : { month: 'long' })
    .format(new Date(year, month - 1, 1))
}

export function monthPeriod(param: string | null): MonthPeriod {
  const [thisYear, thisMonth, thisDay] = today().split('-').map(Number)
  const match = /^(\d{4})-(\d{2})$/.exec(param ?? '')
  let year = match ? Number(match[1]) : thisYear
  let month = match ? Number(match[2]) : thisMonth
  // A month in the future, or a broken one, falls back to this month.
  if (month < 1 || month > 12 || year * 12 + month > thisYear * 12 + thisMonth) {
    year = thisYear
    month = thisMonth
  }

  const isCurrent = year === thisYear && month === thisMonth
  const lastDay = isCurrent ? thisDay : daysIn(year, month)
  const before = shift(year, month, -1)
  const after = shift(year, month, 1)

  return {
    month: `${year}-${pad(month)}`,
    label: monthLabel(year, month, year !== thisYear),
    shortLabel: monthLabel(year, month, false),
    isCurrent,
    dateFrom: iso(year, month, 1),
    dateTo: iso(year, month, lastDay),
    previous: {
      month: `${before.year}-${pad(before.month)}`,
      label: monthLabel(before.year, before.month, before.year !== thisYear),
      shortLabel: monthLabel(before.year, before.month, false),
      dateFrom: iso(before.year, before.month, 1),
      dateTo: iso(before.year, before.month, Math.min(lastDay, daysIn(before.year, before.month))),
    },
    next: isCurrent ? null : `${after.year}-${pad(after.month)}`,
  }
}
