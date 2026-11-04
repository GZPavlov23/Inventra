import { api } from '@/lib/api'
import type { WasteReason } from '@/lib/inventory-api'
import type { ProductUnit } from '@/lib/products-api'

// Shapes match the backend schemas in apps/api/app/schemas/report.py.

type ReportProduct = { id: number; name: string; barcode: string | null; unit: ProductUnit }

export type NoteKind = 'expired' | 'expires_unsold' | 'runs_out' | 'late_delivery' | 'above_forecast'

export type BriefingNote = {
  kind: NoteKind
  at_stake: string
  product: ReportProduct | null
  supplier: { name: string; phone: string | null } | null
  delivery_id: number | null
  deliveries: number | null
  quantity: string | null
  expected: string | null
  batches: number | null
  day: string | null
  delivery_day: string | null
}

export type Briefing = {
  notes: BriefingNote[]
  method: string
}

export type SalesTrend = {
  product_id: number
  quantities: string[]
  total: string
}

export type WasteReport = {
  total: string
  reasons: { reason: WasteReason; value: string; write_offs: number }[]
}

export type RunningOutProduct = {
  product: ReportProduct
  stock: string
  average_daily_sales: string
  days_left: string
}

export type TopProduct = {
  product: ReportProduct
  quantity: string
  revenue: string
  profit: string
}

export type CategorySales = {
  category: string | null
  revenue: string
  profit: string
}

const periodQuery = (dateFrom: string, dateTo: string) =>
  new URLSearchParams({ date_from: dateFrom, date_to: dateTo })

export const reportsApi = {
  waste: (dateFrom: string, dateTo: string) =>
    api<WasteReport>(`/reports/waste?${periodQuery(dateFrom, dateTo)}`),
  runningOut: () => api<RunningOutProduct[]>('/reports/running-out'),
  briefing: () => api<Briefing>('/reports/briefing'),
  salesTrend: (productIds: number[], days: number) => {
    const query = new URLSearchParams({ days: String(days) })
    for (const id of productIds) query.append('product_id', String(id))
    return api<SalesTrend[]>(`/reports/sales-trend?${query}`)
  },
  topProducts: (dateFrom: string, dateTo: string) =>
    api<TopProduct[]>(`/reports/top-products?${periodQuery(dateFrom, dateTo)}`),
  categories: (dateFrom: string, dateTo: string) =>
    api<CategorySales[]>(`/reports/categories?${periodQuery(dateFrom, dateTo)}`),
}
