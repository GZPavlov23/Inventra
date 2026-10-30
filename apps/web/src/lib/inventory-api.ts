import { api } from '@/lib/api'
import type { ProductUnit } from '@/lib/products-api'

// Shapes match the backend schemas in apps/api/app/schemas/inventory.py.

export type BatchStatus = 'in_stock' | 'expiring' | 'expired' | 'all'
export type ExpiryStatus = 'none' | 'fresh' | 'expiring' | 'expired'
export type WasteReason = 'expired' | 'damaged' | 'other'

export type Batch = {
  id: number
  product: { id: number; name: string; barcode: string | null; unit: ProductUnit }
  lot_code: string | null
  expiry_date: string | null
  expiry_status: ExpiryStatus
  received_at: string
  received_quantity: string
  remaining_quantity: string
  purchase_price: string
}

export type BatchPage = {
  items: Batch[]
  total: number
  limit: number
  offset: number
}

export type BatchListParams = {
  search: string
  status: BatchStatus
  limit: number
  offset: number
}

export type ReceiptInput = {
  product_id: number
  quantity: string
  expiry_date: string | null
  lot_code: string
  purchase_price: string | null
}

export type WasteInput = {
  quantity: string
  reason: WasteReason
}

export const inventoryApi = {
  list: ({ search, status, limit, offset }: BatchListParams) => {
    const query = new URLSearchParams({ status, limit: String(limit), offset: String(offset) })
    if (search) query.set('search', search)
    return api<BatchPage>(`/batches?${query}`)
  },
  receive: (data: ReceiptInput) => api<Batch>('/batches', { method: 'POST', body: data }),
  writeOff: (batchId: number, data: WasteInput) =>
    api<Batch>(`/batches/${batchId}/waste`, { method: 'POST', body: data }),
}
