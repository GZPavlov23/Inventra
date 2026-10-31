import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Search, SearchX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
import { type Supplier, suppliersApi, type SupplierStatus } from '@/lib/suppliers-api'
import { SupplierFormDialog } from '@/pages/suppliers/supplier-form-dialog'
import { SuppliersTable, SuppliersTableSkeleton } from '@/pages/suppliers/suppliers-table'

const STATUSES: { value: SupplierStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

function readStatus(value: string | null): SupplierStatus {
  return STATUSES.some((status) => status.value === value) ? (value as SupplierStatus) : 'active'
}

export function SuppliersPage() {
  const { searchParams, search, searchInput, setSearchInput, page, updateParams } = useListParams()
  const status = readStatus(searchParams.get('status'))

  const suppliers = useQuery({
    queryKey: ['suppliers', { search, status, page }],
    queryFn: () =>
      suppliersApi.list({ search, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  useReturnToLastPage(suppliers.data, updateParams)

  const queryClient = useQueryClient()
  const setActive = useMutation({
    mutationFn: ({ supplier, active }: { supplier: Supplier; active: boolean }) =>
      suppliersApi.update(supplier.id, { active }),
    onSuccess: (_, { supplier, active }) => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      if (active) {
        toast.success(`${supplier.name} was restored`)
      } else {
        toast.success(`${supplier.name} was archived`, {
          action: { label: 'Undo', onClick: () => setActive.mutate({ supplier, active: true }) },
        })
      }
    },
    onError: (error) => toast.error(toApiError(error).message),
  })

  // Kept separately from `editing`, so the form doesn't change during the closing animation.
  const [editing, setEditing] = useState<Supplier | undefined>()
  const [editOpen, setEditOpen] = useState(false)
  const openEdit = (supplier: Supplier) => {
    setEditing(supplier)
    setEditOpen(true)
  }

  const clearFilters = () => {
    setSearchInput('')
    updateParams({ q: null, status: null, page: null })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Suppliers</h2>
          <p className="text-sm text-muted-foreground">The companies you buy from.</p>
        </div>
        <AddSupplierButton />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search suppliers"
            placeholder="Search by company or contact"
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

      {suppliers.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {suppliers.error.message}
            <Button size="sm" variant="outline" onClick={() => void suppliers.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : suppliers.isPending ? (
        <div className="rounded-lg border">
          <SuppliersTableSkeleton />
        </div>
      ) : suppliers.data.total === 0 ? (
        search || status !== 'active' ? (
          <Empty className="rounded-lg border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
              <EmptyTitle>No suppliers found</EmptyTitle>
              <EmptyDescription>
                {search ? `Nothing matches “${search}”.` : 'There are no suppliers in this list.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={clearFilters}>Show all active suppliers</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="rounded-lg border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
              <EmptyTitle>No suppliers yet</EmptyTitle>
              <EmptyDescription>Add the companies you buy from, then link your products to them.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <AddSupplierButton />
            </EmptyContent>
          </Empty>
        )
      ) : (
        <>
          <div
            className={`rounded-lg border transition-opacity ${suppliers.isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={suppliers.isFetching}
          >
            <SuppliersTable
              suppliers={suppliers.data.items}
              onEdit={openEdit}
              onSetActive={(supplier, active) => setActive.mutate({ supplier, active })}
            />
          </div>
          <Pagination
            page={page}
            total={suppliers.data.total}
            onPageChange={(next) => updateParams({ page: next === 1 ? null : String(next) })}
          />
        </>
      )}

      <SupplierFormDialog supplier={editing} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}

function AddSupplierButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add supplier
      </Button>
      <SupplierFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
