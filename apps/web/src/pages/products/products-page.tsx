import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Plus, Search, SearchX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useCan, useCurrentUser } from '@/auth/use-auth'
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
import { reportsApi } from '@/lib/reports-api'
import { ProductFormDialog } from '@/pages/products/product-form-dialog'
import { ProductsTable, ProductsTableSkeleton } from '@/pages/products/products-table'
import { useT } from '@/i18n/language-context'

const STATUSES: ProductStatus[] = ['active', 'archived', 'all']

const TREND_DAYS = 14

const SORT_COLUMNS: ProductSort[] = ['name', 'category', 'purchase_price', 'sale_price', 'margin', 'stock']

function readSort(value: string | null): ProductSort {
  return SORT_COLUMNS.includes(value as ProductSort) ? (value as ProductSort) : 'name'
}

function readStatus(value: string | null): ProductStatus {
  return STATUSES.some((status) => status === value) ? (value as ProductStatus) : 'active'
}

export function ProductsPage() {
  const { store } = useCurrentUser()
  const t = useT()
  const can = useCan()
  const editable = can('manage_catalog')
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

  // Only for the products on this page, asked for once the page has arrived. The key starts
  // with 'sales', so a new sale refreshes it.
  const shownIds = products.data?.items.map((product) => product.id) ?? []
  const trends = useQuery({
    queryKey: ['sales', 'trend', TREND_DAYS, shownIds],
    queryFn: () => reportsApi.salesTrend(shownIds, TREND_DAYS),
    enabled: shownIds.length > 0,
    select: (lines) => new Map(lines.map((line) => [line.product_id, line])),
  })

  const queryClient = useQueryClient()
  const setActive = useMutation({
    mutationFn: ({ product, active }: { product: Product; active: boolean }) =>
      productsApi.update(product.id, { active }),
    onSuccess: (_, { product, active }) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      if (active) {
        toast.success(t.products.restored(product.name))
      } else {
        // Archiving is safe to undo, so one click does it and the toast offers the way back.
        toast.success(t.products.archived(product.name), {
          action: { label: t.products.undo, onClick: () => setActive.mutate({ product, active: true }) },
        })
      }
    },
    onError: (error) => toast.error(toApiError(error).message),
  })

  // The product just added or edited, so its row can be pointed out.
  const [justSaved, setJustSaved] = useState<number | undefined>()

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
          <h2 className="text-2xl font-semibold tracking-tight">{t.nav.products}</h2>
          <p className="text-sm text-muted-foreground">{t.products.subtitle}</p>
        </div>
        {editable && <AddProductButton onAdded={(product) => setJustSaved(product.id)} />}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t.products.searchLabel}
            placeholder={t.products.searchPlaceholder}
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
            {STATUSES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t.products.statuses[value]}
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
              {t.common.tryAgain}
            </Button>
          </AlertDescription>
        </Alert>
      ) : products.isPending ? (
        <div className="rounded-2xl bg-card shadow-soft">
          <ProductsTableSkeleton />
        </div>
      ) : products.data.total === 0 ? (
        search || status !== 'active' ? (
          <Empty className="rounded-2xl bg-card shadow-soft">
            <EmptyHeader>
              <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
              <EmptyTitle>{t.products.noneFound}</EmptyTitle>
              <EmptyDescription>
                {search ? t.inventory.nothingMatches(search) : t.products.noneInList}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={clearFilters}>{t.products.showAllActive}</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="rounded-2xl bg-card shadow-soft">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Package /></EmptyMedia>
              <EmptyTitle>{t.products.noProducts}</EmptyTitle>
              <EmptyDescription>
                {editable
                  ? t.products.addFirst
                  : t.products.ownerAdds}
              </EmptyDescription>
            </EmptyHeader>
            {editable && (
              <EmptyContent>
                <AddProductButton onAdded={(product) => setJustSaved(product.id)} />
              </EmptyContent>
            )}
          </Empty>
        )
      ) : (
        <>
          {/* Slightly faded while a new page or search result is loading. */}
          <div
            className={`rounded-2xl bg-card shadow-soft transition-opacity ${products.isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={products.isFetching}
          >
            <ProductsTable
              products={products.data.items}
              currency={store.currency}
              actions={editable ? {
                onEdit: openEdit,
                onSetActive: (product, active) => setActive.mutate({ product, active }),
              } : undefined}
              sorting={{ sort, order, onSort: handleSort }}
              justSaved={justSaved}
              trends={trends.data}
            />
          </div>
          <Pagination
            page={page}
            total={products.data.total}
            onPageChange={(next) => updateParams({ page: next === 1 ? null : String(next) })}
          />
        </>
      )}

      <ProductFormDialog product={editing} open={editOpen} onOpenChange={setEditOpen}
        onSaved={(product) => setJustSaved(product.id)} />
    </div>
  )
}

function AddProductButton({ onAdded }: { onAdded?: (product: Product) => void }) {
  const [open, setOpen] = useState(false)
  const t = useT()
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t.products.add}
      </Button>
      <ProductFormDialog open={open} onOpenChange={setOpen} onSaved={onAdded} />
    </>
  )
}
