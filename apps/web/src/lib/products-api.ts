import { api } from '@/lib/api'

// Shapes match the backend schemas in apps/api/app/schemas/product.py.
// Prices arrive as strings ("1.59"): the API sends exact decimals, not binary floats.

export type ProductUnit = 'pcs' | 'kg' | 'l'
export type ProductStatus = 'active' | 'archived' | 'all'

export type Product = {
  id: number
  name: string
  brand: string | null
  barcode: string | null
  category: string | null
  unit: ProductUnit
  purchase_price: string
  sale_price: string
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
}

export const productsApi = {
  list: ({ search, status, limit, offset }: ProductListParams) => {
    const query = new URLSearchParams({ status, limit: String(limit), offset: String(offset) })
    if (search) query.set('search', search)
    return api<ProductPage>(`/products?${query}`)
  },
  create: (data: ProductInput) => api<Product>('/products', { method: 'POST', body: data }),
}
