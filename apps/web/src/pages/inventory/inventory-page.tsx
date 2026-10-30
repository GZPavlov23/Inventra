import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Boxes, PackagePlus, Search, SearchX } from 'lucide-react'
import { useState } from 'react'

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
import { type Batch, type BatchStatus, inventoryApi } from '@/lib/inventory-api'
import { type BatchAction, BatchesTable, BatchesTableSkeleton } from '@/pages/inventory/batches-table'
import { CorrectionDialog } from '@/pages/inventory/correction-dialog'
import { HistoryDialog } from '@/pages/inventory/history-dialog'
import { ReceiveDialog } from '@/pages/inventory/receive-dialog'
import { WasteDialog } from '@/pages/inventory/waste-dialog'

const STATUSES: { value: BatchStatus; label: string }[] = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
]

function readStatus(value: string | null): BatchStatus {
  return STATUSES.some((status) => status.value === value) ? (value as BatchStatus) : 'in_stock'
}

export function InventoryPage() {
  const { store } = useCurrentUser()
  const { searchParams, search, searchInput, setSearchInput, page, updateParams } = useListParams()
  const status = readStatus(searchParams.get('status'))

  const batches = useQuery({
    queryKey: ['batches', { search, status, page }],
    queryFn: () =>
      inventoryApi.list({ search, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    // While the next page loads, keep showing the current one instead of a blank table.
    placeholderData: keepPreviousData,
  })
  useReturnToLastPage(batches.data, updateParams)

  // Kept separately from `dialogOpen`, so a dialog keeps its content during the closing animation.
  const [selected, setSelected] = useState<{ action: BatchAction; batch: Batch } | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const openDialog = (action: BatchAction, batch: Batch) => {
    setSelected({ action, batch })
    setDialogOpen(true)
  }
  // The row's latest numbers, in case a colleague changed the batch while the dialog is open.
  const batch = batches.data?.items.find((item) => item.id === selected?.batch.id) ?? selected?.batch

  const clearFilters = () => {
    setSearchInput('')
    updateParams({ q: null, status: null, page: null })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Your batches, in the order they should leave the shelf.
          </p>
        </div>
        <ReceiveGoodsButton />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search batches"
            placeholder="Search by product, barcode or lot"
            className="pl-9"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Tabs
          value={status}
          onValueChange={(value) => updateParams({ status: value === 'in_stock' ? null : value, page: null })}
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

      {batches.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {batches.error.message}
            <Button size="sm" variant="outline" onClick={() => void batches.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : batches.isPending ? (
        <div className="rounded-lg border">
          <BatchesTableSkeleton />
        </div>
      ) : batches.data.total === 0 ? (
        search || status !== 'in_stock' ? (
          <Empty className="rounded-lg border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
              <EmptyTitle>No batches found</EmptyTitle>
              <EmptyDescription>
                {search ? `Nothing matches “${search}”.` : 'There are no batches in this list.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={clearFilters}>Show all stock</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="rounded-lg border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Boxes /></EmptyMedia>
              <EmptyTitle>No stock yet</EmptyTitle>
              <EmptyDescription>Receive your first delivery to see it here.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ReceiveGoodsButton />
            </EmptyContent>
          </Empty>
        )
      ) : (
        <>
          {/* Slightly faded while a new page or search result is loading. */}
          <div
            className={`rounded-lg border transition-opacity ${batches.isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={batches.isFetching}
          >
            <BatchesTable batches={batches.data.items} currency={store.currency} onAction={openDialog} />
          </div>
          <Pagination
            page={page}
            total={batches.data.total}
            onPageChange={(next) => updateParams({ page: next === 1 ? null : String(next) })}
          />
        </>
      )}

      <WasteDialog batch={batch} open={dialogOpen && selected?.action === 'write-off'} onOpenChange={setDialogOpen} />
      <CorrectionDialog batch={batch} open={dialogOpen && selected?.action === 'correct'} onOpenChange={setDialogOpen} />
      <HistoryDialog batch={batch} open={dialogOpen && selected?.action === 'history'} onOpenChange={setDialogOpen} />
    </div>
  )
}

function ReceiveGoodsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PackagePlus />
        Receive goods
      </Button>
      <ReceiveDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
