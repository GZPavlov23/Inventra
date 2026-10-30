import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useDebouncedValue } from '@/hooks/use-debounced-value'

export const PAGE_SIZE = 20

// Search, filter and page live in the URL (/products?q=milk&sort=margin&page=2), so they
// survive a reload, work with the Back button and can be shared as a link.
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  // Sets or removes several URL parameters at once (null removes one).
  const updateParams = useCallback(
    (changes: Record<string, string | null>) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  // The box updates instantly; the URL (and so the request) only after typing pauses.
  const [searchInput, setSearchInput] = useState(search)
  const debouncedSearch = useDebouncedValue(searchInput.trim())
  useEffect(() => {
    if (debouncedSearch !== search) updateParams({ q: debouncedSearch, page: null })
  }, [debouncedSearch, search, updateParams])

  return { searchParams, search, searchInput, setSearchInput, page, updateParams }
}

// Removing the last row of the last page would leave an empty page: go back to the last page
// that still has rows. (Also covers a hand-typed ?page=99.)
export function useReturnToLastPage(
  data: { items: unknown[]; total: number } | undefined,
  updateParams: (changes: Record<string, string | null>) => void,
) {
  const pageIsPastTheEnd = data !== undefined && data.items.length === 0 && data.total > 0
  useEffect(() => {
    if (!pageIsPastTheEnd) return
    const lastPage = Math.ceil(data.total / PAGE_SIZE)
    updateParams({ page: lastPage > 1 ? String(lastPage) : null })
  }, [pageIsPastTheEnd, data, updateParams])
}
