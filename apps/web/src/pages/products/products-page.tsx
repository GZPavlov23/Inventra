import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Package, Search, SearchX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useCurrentUser } from '@/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { productsApi, type ProductStatus } from '@/lib/products-api'
import { AddProductDialog } from '@/pages/products/add-product-dialog'
import { ProductsTable, ProductsTableSkeleton } from '@/pages/products/products-table'

const PAGE_SIZE = 20
const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

function readStatus(value: string | null): ProductStatus {
  return STATUSES.some((status) => status.value === value) ? (value as ProductStatus) : 'active'
}

export function ProductsPage() {
  const { store } = useCurrentUser()
  // Search, filter and page live in the URL (/products?q=milk&status=all&page=2), so they
  // survive a reload, work with the Back button and can be shared as a link.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const status = readStatus(searchParams.get('status'))
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

  const products = useQuery({
    queryKey: ['products', { search, status, page }],
    queryFn: () =>
      productsApi.list({ search, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    // While the next page loads, keep showing the current one instead of a blank table.
    placeholderData: keepPreviousData,
  })

  const clearFilters = () => {
    setSearchInput('')
    updateParams({ q: null, status: null, page: null })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
          <p className="text-sm text-muted-foreground">Your product catalog: names, barcodes and prices.</p>
        </div>
        <AddProductDialog />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search products"
            placeholder="Search by name, brand or barcode"
            className="pl-9"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Tabs
          value={status}
          onValueChange={(value) => updateParams({ status: value === 'active' ? null : value, page: null })}
        >
          <TabsList>
            {STATUSES.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {products.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {products.error.message}
            <Button size="sm" variant="outline" onClick={() => void products.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : products.isPending ? (
        <div className="rounded-lg border">
          <ProductsTableSkeleton />
        </div>
      ) : products.data.total === 0 ? (
        search || status !== 'active' ? (
          <Empty className="rounded-lg border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
              <EmptyTitle>No products found</EmptyTitle>
              <EmptyDescription>
                {search ? `Nothing matches “${search}”.` : 'There are no products in this list.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={clearFilters}>Show all active products</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="rounded-lg border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Package /></EmptyMedia>
              <EmptyTitle>No products yet</EmptyTitle>
              <EmptyDescription>Add your first product to start building your catalog.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <AddProductDialog />
            </EmptyContent>
          </Empty>
        )
      ) : (
        <>
          {/* Slightly faded while a new page or search result is loading. */}
          <div
            className={`rounded-lg border transition-opacity ${products.isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={products.isFetching}
          >
            <ProductsTable products={products.data.items} currency={store.currency} />
          </div>
          <Pagination
            page={page}
            total={products.data.total}
            onPageChange={(next) => updateParams({ page: next === 1 ? null : String(next) })}
          />
        </>
      )}
    </div>
  )
}

function Pagination({ page, total, onPageChange }: {
  page: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const first = (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <p>
        Showing <span className="font-medium text-foreground">{first}–{last}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft /> Previous
          </Button>
          <span>Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            Next <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
