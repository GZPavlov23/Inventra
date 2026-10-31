import { api } from '@/lib/api'
import type { ProductUnit } from '@/lib/products-api'
import type { SupplierRef } from '@/lib/suppliers-api'

// Shapes match the backend schemas in apps/api/app/schemas/delivery.py.

export type DeliveryStatus = 'ordered' | 'received' | 'cancelled'
export type DeliveryFilter = DeliveryStatus | 'all'

export type DeliveryLine = {
  id: number
  product: { id: number; name: string; barcode: string | null; unit: ProductUnit }
  ordered_quantity: string
  unit_cost: string
  received_quantity: string | null
  batch: { id: number; lot_code: string | null; expiry_date: string | null; purchase_price: string } | null
}

export type Delivery = {
  id: number
  supplier: SupplierRef
  actor: { full_name: string }
  status: DeliveryStatus
  expected_on: string | null
  received_at: string | null
  invoice_number: string | null
  ordered_total: string
  received_total: string | null
  created_at: string
  items: DeliveryLine[]
}

export type DeliveryPage = {
  items: Delivery[]
  total: number
  limit: number
  offset: number
}

export type DeliveryInput = {
  supplier_id: number
  expected_on: string | null
  items: { product_id: number; quantity: string; unit_cost: string }[]
}

export type DeliveryReceiptInput = {
  invoice_number: string
  items: {
    item_id: number
    quantity: string
    expiry_date: string | null
    lot_code: string
    unit_cost: string
  }[]
}

export const deliveriesApi = {
  list: (status: DeliveryFilter, limit: number, offset: number) =>
    api<DeliveryPage>(`/deliveries?status=${status}&limit=${limit}&offset=${offset}`),
  create: (data: DeliveryInput) => api<Delivery>('/deliveries', { method: 'POST', body: data }),
  receive: (id: number, data: DeliveryReceiptInput) =>
    api<Delivery>(`/deliveries/${id}/receive`, { method: 'POST', body: data }),
  cancel: (id: number) => api<Delivery>(`/deliveries/${id}/cancel`, { method: 'POST' }),
}
