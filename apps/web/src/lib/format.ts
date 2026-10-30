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

// Today as "2026-10-30", the format date inputs use.
export function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${date}`
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
