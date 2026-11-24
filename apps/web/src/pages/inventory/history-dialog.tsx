import { useInfiniteQuery } from '@tanstack/react-query'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DetailsPanel } from '@/components/details-panel'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { formatChange, formatDateTime, formatDay } from '@/lib/format'
import { type Batch, inventoryApi, type Movement } from '@/lib/inventory-api'
import type { Messages } from '@/i18n/en'
import { useT } from '@/i18n/language-context'

const HISTORY_PAGE_SIZE = 50

// Waste reasons are stored as codes; a correction's reason is what the person typed.
function movementReason({ type, reason }: Movement, t: Messages): string | null {
  return type === 'waste' && reason ? (t.inventory.wasteReasons[reason] ?? reason) : reason
}

type HistoryDialogProps = {
  batch?: Batch
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HistoryDialog({ batch, open, onOpenChange }: HistoryDialogProps) {
  const t = useT()
  return (
    <DetailsPanel
      open={open}
      onOpenChange={onOpenChange}
      title={t.inventory.historyTitle}
      description={batch && (batch.expiry_date
        ? t.inventory.historyOf(batch.product.name, formatDay(batch.expiry_date))
        : `${batch.product.name}.`)}
    >
      {batch && <HistoryList key={batch.id} batch={batch} />}
    </DetailsPanel>
  )
}

function HistoryList({ batch }: { batch: Batch }) {
  const t = useT()
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
          <Button size="sm" variant="outline" onClick={() => void history.refetch()}>{t.common.tryAgain}</Button>
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
          const reason = movementReason(movement, t)
          return (
            <li key={movement.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.inventory.movements[movement.type]}</p>
                {reason && <p className="text-sm break-words text-muted-foreground">{reason}</p>}
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(movement.occurred_at)} · {movement.actor.full_name}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium figures">
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
          {t.inventory.showOlder}
        </Button>
      )}
    </div>
  )
}
