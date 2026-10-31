import { api } from '@/lib/api'
import type { ProductUnit } from '@/lib/products-api'

// Shapes match the backend schemas in apps/api/app/schemas/forecast.py.

export type ProductForecast = {
  product: { id: number; name: string; barcode: string | null; unit: ProductUnit }
  history_days: number
  total: string
  stock: string
  shortage: string
  days: { day: string; quantity: string }[]
}

export type ForecastReport = {
  horizon: number
  method: string
  items: ProductForecast[]
  not_enough_history: number
}

export type ModelAccuracy = {
  method: string
  daily_wape: string | null
  weekly_wape: string | null
  bias: string
  days: number
  products: number
}

export type AccuracyReport = {
  chosen: string
  models: ModelAccuracy[]
}

export type OrderLine = {
  product: { id: number; name: string; barcode: string | null; unit: ProductUnit }
  expected: string
  from_stock: string
  expiring_unsold: string
  left_over: string
  buffer: string
  order: string
  unit_cost: string
  cost: string
}

export type OrderReport = {
  days: number
  method: string
  buffer_share: string
  items: OrderLine[]
  total_cost: string
  products_checked: number
}

// The API writes 31.0 for 31 pieces, which is no way to show a number of pieces in a form.
export const recommendedQuantity = (line: OrderLine) => String(Number(line.order))

export const forecastsApi = {
  forecast: (horizon: number) => api<ForecastReport>(`/forecasts?horizon=${horizon}`),
  accuracy: () => api<AccuracyReport>('/forecasts/accuracy'),
  orders: (days: number) => api<OrderReport>(`/forecasts/orders?days=${days}`),
}
