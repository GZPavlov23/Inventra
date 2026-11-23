import { api } from '@/lib/api'

// Shape matches the backend schema in apps/api/app/schemas/setup.py.
export type StoreSetup = {
  products: boolean
  goods: boolean
  sales: boolean
  suppliers: boolean
  // null for someone who can't invite people: only the owner can, so the step isn't theirs.
  team: boolean | null
  done: boolean
}

export const setupApi = {
  progress: () => api<StoreSetup>('/store/setup'),
}
