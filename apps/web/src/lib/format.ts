import type { ProductUnit } from '@/lib/products-api'

// Number and date formatting shared by all pages, so values look the same everywhere.

export function formatMoney(amount: string | number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount))
}

// "14.500" kg becomes "14.5 kg": the API always sends three decimals.
export function formatQuantity(quantity: string | number, unit: ProductUnit): string {
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number(quantity))
  return `${number} ${unit}`
}

// A sale line in whole cents, rounded like the server does (half up). Whole numbers keep it
// exact: as a binary float 0.750 × 1.89 isn't quite 1.4175, and could round the other way.
export function lineCents(quantity: string, unitPrice: string): number {
  const thousandths = Math.round(Number(quantity) * 1000)
  const cents = Math.round(Number(unitPrice) * 100)
  return Math.floor((thousandths * cents + 500) / 1000)
}

// A change in stock always shows its direction: "+12 pcs" or "-4 pcs".
export function formatChange(quantity: string | number, unit: ProductUnit): string {
  return `${Number(quantity) > 0 ? '+' : ''}${formatQuantity(quantity, unit)}`
}

export function formatDateTime(moment: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(moment))
}

// "2026-11-01" is a calendar day. new Date() would read it as midnight in UTC, which is
// still the previous day in some time zones, so it is built from its parts instead.
function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

export function formatDay(day: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parseDay(day))
}

// A day as "2026-10-30", the format date inputs and the API use.
function toDayString(moment: Date): string {
  const month = String(moment.getMonth() + 1).padStart(2, '0')
  const date = String(moment.getDate()).padStart(2, '0')
  return `${moment.getFullYear()}-${month}-${date}`
}

export function today(): string {
  return toDayString(new Date())
}

export function daysAgo(days: number): string {
  const moment = new Date()
  moment.setDate(moment.getDate() - days)
  return toDayString(moment)
}

// Rounded, because a day with a clock change isn't exactly 24 hours long.
export function daysUntil(day: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  return Math.round((parseDay(day).getTime() - parseDay(today()).getTime()) / millisecondsPerDay)
}

// Gross margin: the share of the sale price that is profit. null when the price is 0.
export function marginPercent(purchasePrice: string, salePrice: string): number | null {
  const sale = Number(salePrice)
  if (sale === 0) return null
  return ((sale - Number(purchasePrice)) / sale) * 100
}
