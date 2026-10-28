import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'

// One cache for all server data (products, later batches, sales...). TanStack Query keeps
// loading/error state for us and refetches data that is marked as out of date.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data counts as fresh for 30 seconds; after that it is refetched when used again.
      staleTime: 30_000,
      // Retrying a 4xx (e.g. 401, 404, 422) can't succeed, so only network/server errors retry.
      retry: (failureCount, error) => {
        const clientError = error instanceof ApiError && error.status >= 400 && error.status < 500
        return !clientError && failureCount < 1
      },
    },
  },
})
