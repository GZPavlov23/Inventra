import { api } from '@/lib/api'
import type { SupplierRef } from '@/lib/suppliers-api'

// Shapes match the backend schemas in apps/api/app/schemas/product.py.
// Prices arrive as strings ("1.59"): the API sends exact decimals, not binary floats.

export type ProductUnit = 'pcs' | 'kg' | 'l'
export type ProductStatus = 'active' | 'archived' | 'all'
export type ProductSort = 'name' | 'category' | 'purchase_price' | 'sale_price' | 'markup' | 'margin' | 'stock'
export type SortOrder = 'asc' | 'desc'

export type Product = {
  id: number
  name: string
  brand: string | null
  barcode: string | null
  category: string | null
  unit: ProductUnit
  purchase_price: string
  sale_price: string
  stock: string
  supplier: SupplierRef | null
  active: boolean
  created_at: string
  updated_at: string
}

export type ProductPage = {
  items: Product[]
  total: number
  limit: number
  offset: number
}

export type ProductListParams = {
  search: string
  status: ProductStatus
  sort: ProductSort
  order: SortOrder
  limit: number
  offset: number
}

export type ProductInput = {
  name: string
  brand: string
  category: string
  barcode: string
  unit: ProductUnit
  purchase_price: string
  sale_price: string
  supplier_id: number | null
}

export type StoryEvent = {
  kind: 'received' | 'sold' | 'written_off' | 'corrected' | 'ordered'
  at: string
  quantity: string
  sales: number | null
  reason: string | null
  actor: string | null
  supplier: string | null
  delivery_id: number | null
  expiry_date: string | null
  lot_code: string | null
  expected_on: string | null
  status: 'ordered' | 'received' | 'cancelled' | null
}

// Shapes match the backend schemas in apps/api/app/schemas/story.py.
export type ProductStory = {
  days: { day: string; events: StoryEvent[] }[]
  earlier: string | null
  attention: {
    expired: { batch_id: number; quantity: string; expiry_date: string }[]
    late: { delivery_id: number; supplier: string; phone: string | null; expected_on: string }[]
  }
}

export const productsApi = {
  get: (id: number) => api<Product>(`/products/${id}`),
  // Thirty days at a time, the newest first; `until` is the newest day to show.
  story: (id: number, until?: string) =>
    api<ProductStory>(`/products/${id}/story${until ? `?until=${until}` : ''}`),
  list: ({ search, status, sort, order, limit, offset }: ProductListParams) => {
    const query = new URLSearchParams({
      status,
      sort,
      order,
      limit: String(limit),
      offset: String(offset),
    })
    if (search) query.set('search', search)
    return api<ProductPage>(`/products?${query}`)
  },
  categories: () => api<string[]>('/products/categories'),
  create: (data: ProductInput) => api<Product>('/products', { method: 'POST', body: data }),
  update: (id: number, data: Partial<ProductInput> & { active?: boolean }) =>
    api<Product>(`/products/${id}`, { method: 'PATCH', body: data }),
}
