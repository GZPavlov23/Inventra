import { api } from '@/lib/api'

// Shapes match the backend schemas in apps/api/app/schemas/product.py.
// Prices arrive as strings ("1.59"): the API sends exact decimals, not binary floats.

export type ProductUnit = 'pcs' | 'kg' | 'l'
export type ProductStatus = 'active' | 'archived' | 'all'
export type ProductSort = 'name' | 'category' | 'purchase_price' | 'sale_price' | 'margin' | 'stock'
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
}

export const productsApi = {
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
