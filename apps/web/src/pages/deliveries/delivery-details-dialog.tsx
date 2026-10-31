import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { toApiError } from '@/lib/api'
import { deliveriesApi, type Delivery, type DeliveryLine } from '@/lib/deliveries-api'
import { formatDateTime, formatDay, formatMoney, formatQuantity } from '@/lib/format'
import { DeliveryStatusBadge } from '@/pages/deliveries/deliveries-table'

type DeliveryDetailsDialogProps = {
  delivery?: Delivery
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onReceive: (delivery: Delivery) => void
}

export function DeliveryDetailsDialog({ delivery, currency, open, onOpenChange, onReceive }: DeliveryDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Delivery #{delivery?.id}
            {delivery && <DeliveryStatusBadge delivery={delivery} />}
          </DialogTitle>
          <DialogDescription>{delivery && summaryText(delivery)}</DialogDescription>
        </DialogHeader>
        {delivery && (
          <Details
            key={delivery.id}
            delivery={delivery}
            currency={currency}
            onClose={() => onOpenChange(false)}
            onReceive={() => onReceive(delivery)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function summaryText(delivery: Delivery): string {
  const parts = [delivery.supplier.name]
  if (delivery.received_at) parts.push(`received ${formatDateTime(delivery.received_at)}`)
  else if (delivery.expected_on) parts.push(`expected ${formatDay(delivery.expected_on)}`)
  if (delivery.invoice_number) parts.push(`invoice ${delivery.invoice_number}`)
  return parts.join(' · ')
}

function Details({ delivery, currency, onClose, onReceive }: {
  delivery: Delivery
  currency: string
  onClose: () => void
  onReceive: () => void
}) {
  const queryClient = useQueryClient()
  // Cancelling can't be undone, so the button asks once more before it does anything.
  const [confirming, setConfirming] = useState(false)

  const cancel = useMutation({
    mutationFn: () => deliveriesApi.cancel(delivery.id),
    onSuccess: () => {
      toast.success(`Delivery #${delivery.id} was cancelled`)
      onClose()
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
  })

  return (
    <>
      {cancel.error && (
        <Alert variant="destructive">
          <AlertDescription>{toApiError(cancel.error).message}</AlertDescription>
        </Alert>
      )}

      <ul className="flex flex-col divide-y">
        {delivery.items.map((line) => (
          <LineRow key={line.id} line={line} delivery={delivery} currency={currency} />
        ))}
      </ul>

      <dl className="flex flex-col gap-1 border-t pt-3 text-sm">
        {delivery.received_total !== null && (
          <TotalRow label="Received" value={formatMoney(delivery.received_total, currency)} strong />
        )}
        <TotalRow
          label="Ordered"
          value={formatMoney(delivery.ordered_total, currency)}
          strong={delivery.received_total === null}
        />
      </dl>

      {delivery.status === 'ordered' && (
        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)}>Keep it</Button>
              <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                {cancel.isPending && <Spinner />}
                Yes, cancel this delivery
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setConfirming(true)}>Cancel delivery</Button>
              <Button onClick={onReceive}>Receive goods</Button>
            </>
          )}
        </DialogFooter>
      )}
    </>
  )
}

function LineRow({ line, delivery, currency }: { line: DeliveryLine; delivery: Delivery; currency: string }) {
  const { product, batch } = line
  const ordered = formatQuantity(line.ordered_quantity, product.unit)
  const received = line.received_quantity === null ? null : Number(line.received_quantity)
  const short = received !== null && received < Number(line.ordered_quantity)
  const price = batch?.purchase_price ?? line.unit_cost

  return (
    <li className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{product.name}</p>
        {delivery.status === 'received' && received !== null ? (
          <p className={`text-sm tabular-nums ${short ? 'text-destructive' : 'text-muted-foreground'}`}>
            {received === 0 ? 'Never arrived' : `${formatQuantity(received, product.unit)} arrived`}, ordered {ordered}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground tabular-nums">{ordered}</p>
        )}
        {batch && (
          <p className="text-xs text-muted-foreground">
            {batch.expiry_date ? `Expires ${formatDay(batch.expiry_date)}` : 'No expiry date'}
            {batch.lot_code && `, lot ${batch.lot_code}`}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
        {formatMoney(price, currency)} / {product.unit}
      </span>
    </li>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-medium' : 'text-muted-foreground'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
