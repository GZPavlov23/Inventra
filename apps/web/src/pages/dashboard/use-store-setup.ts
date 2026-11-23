import { useQuery } from '@tanstack/react-query'

import { setupApi } from '@/lib/setup-api'

// Shared by the greeting and the list, so they ask the server once. Asked again on every visit
// to the dashboard: adding a product, receiving goods or inviting someone elsewhere ticks a
// step off, and the list should show it as soon as you are back.
export function useStoreSetup() {
  return useQuery({ queryKey: ['store', 'setup'], queryFn: setupApi.progress, refetchOnMount: 'always' })
}
