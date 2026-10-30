import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Plus, Search, SearchX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useCurrentUser } from '@/auth/use-auth'
import { Pagination } from '@/components/pagination'
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
import { PAGE_SIZE, useListParams, useReturnToLastPage } from '@/hooks/use-list-params'
import { toApiError } from '@/lib/api'
import {
  type Product,
  productsApi,
  type ProductSort,
  type ProductStatus,
  type SortOrder,
} from '@/lib/products-api'
import { ProductFormDialog } from '@/pages/products/product-form-dialog'
import { ProductsTable, ProductsTableSkeleton } from '@/pages/products/products-table'

const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

const SORT_COLUMNS: ProductSort[] = ['name', 'category', 'purchase_price', 'sale_price', 'margin', 'stock']

function readSort(value: string | null): ProductSort {
  return SORT_COLUMNS.includes(value as ProductSort) ? (value as ProductSort) : 'name'
}

function readStatus(value: string | null): ProductStatus {
  return STATUSES.some((status) => status.value === value) ? (value as ProductStatus) : 'active'
}

export function ProductsPage() {
  const { store } = useCurrentUser()
  const { searchParams, search, searchInput, setSearchInput, page, updateParams } = useListParams()
  const status = readStatus(searchParams.get('status'))
  const sort = readSort(searchParams.get('sort'))
  const order: SortOrder = searchParams.get('order') === 'desc' ? 'desc' : 'asc'

  const products = useQuery({
    queryKey: ['products', { search, status, sort, order, page }],
    queryFn: () =>
      productsApi.list({
        search,
        status,
        sort,
        order,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    // While the next page loads, keep showing the current one instead of a blank table.
    placeholderData: keepPreviousData,
  })

  useReturnToLastPage(products.data, updateParams)

  const queryClient = useQueryClient()
  const setActive = useMutation({
    mutationFn: ({ product, active }: { product: Product; active: boolean }) =>
      productsApi.update(product.id, { active }),
    onSuccess: (_, { product, active }) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      if (active) {
        toast.success(`${product.name} was restored`)
      } else {
        // Archiving is safe to undo, so one click does it and the toast offers the way back.
        toast.success(`${product.name} was archived`, {
          action: { label: 'Undo', onClick: () => setActive.mutate({ product, active: true }) },
        })
      }
    },
    onError: (error) => toast.error(toApiError(error).message),
  })

  // Kept separately from `editing`, so the form doesn't change during the closing animation.
  const [editing, setEditing] = useState<Product | undefined>()
  const [editOpen, setEditOpen] = useState(false)
  const openEdit = (product: Product) => {
    setEditing(product)
    setEditOpen(true)
  }

  // The first click on a column sorts it ascending, the next one flips the direction. The
  // default order (name, A to Z) stays out of the URL.
  const handleSort = (column: ProductSort) => {
    const nextOrder = column === sort && order === 'asc' ? 'desc' : 'asc'
    const isDefault = column === 'name' && nextOrder === 'asc'
    updateParams({
      sort: isDefault ? null : column,
      order: nextOrder === 'desc' ? 'desc' : null,
      page: null,
    })
  }

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
        <AddProductButton />
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
              <AddProductButton />
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
            <ProductsTable
              products={products.data.items}
              currency={store.currency}
              onEdit={openEdit}
              onSetActive={(product, active) => setActive.mutate({ product, active })}
              sorting={{ sort, order, onSort: handleSort }}
            />
          </div>
          <Pagination
            page={page}
            total={products.data.total}
            onPageChange={(next) => updateParams({ page: next === 1 ? null : String(next) })}
          />
        </>
      )}

      <ProductFormDialog product={editing} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}

function AddProductButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add product
      </Button>
      <ProductFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
