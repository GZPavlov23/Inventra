import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Truck } from 'lucide-react'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PAGE_SIZE, useListParams, useReturnToLastPage } from '@/hooks/use-list-params'
import { deliveriesApi, type Delivery, type DeliveryFilter } from '@/lib/deliveries-api'
import { DeliveriesTable, DeliveriesTableSkeleton } from '@/pages/deliveries/deliveries-table'
import { DeliveryDetailsDialog } from '@/pages/deliveries/delivery-details-dialog'
import { NewDeliveryDialog } from '@/pages/deliveries/new-delivery-dialog'
import { ReceiveDeliveryDialog } from '@/pages/deliveries/receive-delivery-dialog'

const STATUSES: { value: DeliveryFilter; label: string }[] = [
  { value: 'ordered', label: 'On the way' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
]

function readStatus(value: string | null): DeliveryFilter {
  return STATUSES.some((status) => status.value === value) ? (value as DeliveryFilter) : 'ordered'
}

export function DeliveriesPage() {
  const { store } = useCurrentUser()
  const { searchParams, page, updateParams } = useListParams()
  const status = readStatus(searchParams.get('status'))

  const deliveries = useQuery({
    queryKey: ['deliveries', { status, page }],
    queryFn: () => deliveriesApi.list(status, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    placeholderData: keepPreviousData,
  })

  useReturnToLastPage(deliveries.data, updateParams)

  // Kept separately from the open flags, so a dialog doesn't change during its closing animation.
  const [opened, setOpened] = useState<Delivery | undefined>()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const openDetails = (delivery: Delivery) => {
    setOpened(delivery)
    setDetailsOpen(true)
  }
  const openReceive = (delivery: Delivery) => {
    setOpened(delivery)
    setDetailsOpen(false)
    setReceiveOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Deliveries</h2>
          <p className="text-sm text-muted-foreground">What you ordered and what really arrived.</p>
        </div>
        <NewDeliveryButton />
      </div>

      <Tabs
        value={status}
        onValueChange={(value) => updateParams({ status: value === 'ordered' ? null : value, page: null })}
      >
        <TabsList>
          {STATUSES.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {deliveries.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {deliveries.error.message}
            <Button size="sm" variant="outline" onClick={() => void deliveries.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : deliveries.isPending ? (
        <div className="rounded-lg border">
          <DeliveriesTableSkeleton />
        </div>
      ) : deliveries.data.total === 0 ? (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Truck /></EmptyMedia>
            <EmptyTitle>{status === 'ordered' ? 'Nothing on the way' : 'No deliveries here'}</EmptyTitle>
            <EmptyDescription>
              {status === 'ordered'
                ? 'Add a delivery when you order goods from a supplier.'
                : 'There are no deliveries in this list.'}
            </EmptyDescription>
          </EmptyHeader>
          {status === 'ordered' && (
            <EmptyContent>
              <NewDeliveryButton />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div
            className={`rounded-lg border transition-opacity ${deliveries.isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={deliveries.isFetching}
          >
            <DeliveriesTable
              deliveries={deliveries.data.items}
              currency={store.currency}
              onOpen={openDetails}
              onReceive={openReceive}
            />
          </div>
          <Pagination
            page={page}
            total={deliveries.data.total}
            onPageChange={(next) => updateParams({ page: next === 1 ? null : String(next) })}
          />
        </>
      )}

      <DeliveryDetailsDialog
        delivery={opened}
        currency={store.currency}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onReceive={openReceive}
      />
      <ReceiveDeliveryDialog
        delivery={opened}
        currency={store.currency}
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
      />
    </div>
  )
}

function NewDeliveryButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        New delivery
      </Button>
      <NewDeliveryDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
