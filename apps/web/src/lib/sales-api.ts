import { api } from '@/lib/api'
import type { ProductUnit } from '@/lib/products-api'

// Shapes match the backend schemas in apps/api/app/schemas/sale.py.

export type SaleLine = {
  id: number
  product: { id: number; name: string; barcode: string | null; unit: ProductUnit }
  quantity: string
  unit_price: string
  total: string
  cost: string
  // One per batch the goods came from.
  movements: {
    quantity_delta: string
    batch: { id: number; lot_code: string | null; expiry_date: string | null; purchase_price: string }
  }[]
}

export type Sale = {
  id: number
  sold_at: string
  actor: { full_name: string }
  total: string
  cost: string
  profit: string
  items: SaleLine[]
}

export type SalePage = {
  items: Sale[]
  total: number
  limit: number
  offset: number
}

export type SaleSummary = {
  sales: number
  revenue: string
  cost: string
  profit: string
}

export type SaleInput = {
  items: { product_id: number; quantity: string; unit_price: string }[]
}

// Both days are included. Without them the list covers all sales.
export type SalePeriod = {
  dateFrom?: string
  dateTo?: string
}

function periodQuery({ dateFrom, dateTo }: SalePeriod): URLSearchParams {
  const query = new URLSearchParams()
  if (dateFrom) query.set('date_from', dateFrom)
  if (dateTo) query.set('date_to', dateTo)
  return query
}

export const salesApi = {
  list: (period: SalePeriod, limit: number, offset: number) => {
    const query = periodQuery(period)
    query.set('limit', String(limit))
    query.set('offset', String(offset))
    return api<SalePage>(`/sales?${query}`)
  },
  summary: (period: SalePeriod) => api<SaleSummary>(`/sales/summary?${periodQuery(period)}`),
  create: (data: SaleInput) => api<Sale>('/sales', { method: 'POST', body: data }),
}
