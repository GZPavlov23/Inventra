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

export const forecastsApi = {
  forecast: (horizon: number) => api<ForecastReport>(`/forecasts?horizon=${horizon}`),
  accuracy: () => api<AccuracyReport>('/forecasts/accuracy'),
}
