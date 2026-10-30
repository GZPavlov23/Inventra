import { useInfiniteQuery } from '@tanstack/react-query'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { formatChange, formatDateTime, formatDay } from '@/lib/format'
import { type Batch, inventoryApi, type Movement } from '@/lib/inventory-api'

const HISTORY_PAGE_SIZE = 50

const MOVEMENT_LABELS: Record<Movement['type'], string> = {
  receipt: 'Received',
  waste: 'Written off',
  adjustment: 'Correction',
  sale: 'Sold',
}

// Waste reasons are stored as codes; a correction's reason is what the person typed.
const WASTE_REASONS: Record<string, string> = {
  expired: 'Expired',
  damaged: 'Damaged',
  other: 'Other reason',
}

function movementReason({ type, reason }: Movement): string | null {
  return type === 'waste' && reason ? (WASTE_REASONS[reason] ?? reason) : reason
}

type HistoryDialogProps = {
  batch?: Batch
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HistoryDialog({ batch, open, onOpenChange }: HistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Batch history</DialogTitle>
          <DialogDescription>
            {batch && (batch.expiry_date
              ? `${batch.product.name}, expires ${formatDay(batch.expiry_date)}.`
              : `${batch.product.name}.`)}
          </DialogDescription>
        </DialogHeader>
        {batch && <HistoryList key={batch.id} batch={batch} />}
      </DialogContent>
    </Dialog>
  )
}

function HistoryList({ batch }: { batch: Batch }) {
  const history = useInfiniteQuery({
    // Starts with 'batches', so every change to stock refreshes this list too.
    queryKey: ['batches', batch.id, 'movements'],
    queryFn: ({ pageParam }) => inventoryApi.movements(batch.id, HISTORY_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit
      return next < lastPage.total ? next : undefined
    },
  })

  if (history.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          {history.error.message}
          <Button size="sm" variant="outline" onClick={() => void history.refetch()}>Try again</Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (history.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const movements = history.data.pages.flatMap((page) => page.items)

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {movements.map((movement) => {
          const reason = movementReason(movement)
          return (
            <li key={movement.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{MOVEMENT_LABELS[movement.type]}</p>
                {reason && <p className="text-sm break-words text-muted-foreground">{reason}</p>}
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(movement.occurred_at)} · {movement.actor.full_name}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatChange(movement.quantity_delta, batch.product.unit)}
              </span>
            </li>
          )
        })}
      </ul>
      {history.hasNextPage && (
        <Button variant="outline" size="sm" className="self-center" disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}>
          {history.isFetchingNextPage && <Spinner />}
          Show older
        </Button>
      )}
    </div>
  )
}
