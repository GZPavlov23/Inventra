import { api } from '@/lib/api'

// Shapes match the backend schemas in apps/api/app/schemas/supplier.py.

export type SupplierStatus = 'active' | 'archived' | 'all'

export type SupplierRef = {
  id: number
  name: string
  active: boolean
}

export type Supplier = SupplierRef & {
  contact_name: string | null
  phone: string | null
  email: string | null
  notes: string | null
  product_count: number
  created_at: string
  updated_at: string
}

export type SupplierPage = {
  items: Supplier[]
  total: number
  limit: number
  offset: number
}

export type SupplierListParams = {
  search: string
  status: SupplierStatus
  limit: number
  offset: number
}

export type SupplierInput = {
  name: string
  contact_name: string
  phone: string
  email: string
  notes: string
}

export const suppliersApi = {
  list: ({ search, status, limit, offset }: SupplierListParams) => {
    const query = new URLSearchParams({ status, limit: String(limit), offset: String(offset) })
    if (search) query.set('search', search)
    return api<SupplierPage>(`/suppliers?${query}`)
  },
  // Everything a form needs to offer as a choice. The API's largest page is plenty for one store.
  choices: () => suppliersApi.list({ search: '', status: 'active', limit: 200, offset: 0 }),
  create: (data: SupplierInput) => api<Supplier>('/suppliers', { method: 'POST', body: data }),
  update: (id: number, data: Partial<SupplierInput> & { active?: boolean }) =>
    api<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: data }),
}
