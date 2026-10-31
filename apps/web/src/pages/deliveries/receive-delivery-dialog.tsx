import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/form-field'
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
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { toApiError } from '@/lib/api'
import { deliveriesApi, type Delivery, type DeliveryLine } from '@/lib/deliveries-api'
import { formatMoney, formatQuantity, lineCents, today } from '@/lib/format'

type ArrivedLine = {
  quantity: string
  expiryDate: string
  lotCode: string
  unitCost: string
}

function asArrivedInFull(line: DeliveryLine): ArrivedLine {
  return { quantity: String(Number(line.ordered_quantity)), expiryDate: '', lotCode: '', unitCost: line.unit_cost }
}

type ReceiveDeliveryDialogProps = {
  delivery?: Delivery
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReceiveDeliveryDialog({ delivery, currency, open, onOpenChange }: ReceiveDeliveryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Receive delivery #{delivery?.id}</DialogTitle>
          <DialogDescription>
            Enter what really arrived. Every product becomes a new batch, all at once.
          </DialogDescription>
        </DialogHeader>
        {delivery && (
          <ReceiveForm
            key={delivery.id}
            delivery={delivery}
            currency={currency}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReceiveForm({ delivery, currency, onClose }: {
  delivery: Delivery
  currency: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [arrived, setArrived] = useState<Record<number, ArrivedLine>>(() =>
    Object.fromEntries(delivery.items.map((line) => [line.id, asArrivedInFull(line)])),
  )

  const receive = useMutation({
    mutationFn: () =>
      deliveriesApi.receive(delivery.id, {
        invoice_number: invoiceNumber,
        items: delivery.items.map((line) => {
          const { quantity, expiryDate, lotCode, unitCost } = arrived[line.id]
          return {
            item_id: line.id,
            quantity,
            expiry_date: expiryDate || null,
            lot_code: lotCode,
            unit_cost: unitCost,
          }
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(`Delivery #${delivery.id} was received`)
      onClose()
    },
    // A refusal can mean someone else already received it, so the list should show the truth.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
  })

  const updateLine = (lineId: number, changes: Partial<ArrivedLine>) => {
    if (receive.isError) receive.reset()
    setArrived((current) => ({ ...current, [lineId]: { ...current[lineId], ...changes } }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    receive.mutate()
  }

  const lines = Object.values(arrived)
  const totalCents = lines.reduce((sum, line) => sum + lineCents(line.quantity, line.unitCost), 0)
  const nothingArrived = lines.every((line) => Number(line.quantity) === 0)
  const error = receive.error ? toApiError(receive.error) : null

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="sm:max-w-56">
        <FormField id="invoice_number" label="Invoice number">
          <Input id="invoice_number" maxLength={64} autoComplete="off"
            value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
        </FormField>
      </div>

      <ul className="flex flex-col divide-y" aria-label="Products in this delivery">
        {delivery.items.map((line) => (
          <ArrivedRow
            key={line.id}
            line={line}
            arrived={arrived[line.id]}
            onChange={(changes) => updateLine(line.id, changes)}
          />
        ))}
      </ul>

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">Total at these prices</span>
        <span className="text-lg font-semibold" aria-label="Received total">
          {formatMoney(totalCents / 100, currency)}
        </span>
      </div>

      {nothingArrived && (
        <p className="text-sm text-muted-foreground">
          If nothing arrived, close this and cancel the delivery instead.
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Back</Button>
        <Button type="submit" disabled={receive.isPending || nothingArrived}>
          {receive.isPending && <Spinner />}
          Receive goods
        </Button>
      </DialogFooter>
    </form>
  )
}

function ArrivedRow({ line, arrived, onChange }: {
  line: DeliveryLine
  arrived: ArrivedLine
  onChange: (changes: Partial<ArrivedLine>) => void
}) {
  const { product } = line
  // The browser refuses half a piece before the form is even sent.
  const smallestAmount = product.unit === 'pcs' ? '1' : '0.001'
  const missing = Number(arrived.quantity) === 0

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-medium">{product.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          Ordered {formatQuantity(line.ordered_quantity, product.unit)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[6rem_6rem_1fr_1fr]">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Arrived</span>
          <Input type="number" inputMode="decimal" required aria-label={`Arrived of ${product.name}`}
            min="0" step={smallestAmount} max="100000"
            value={arrived.quantity} onChange={(event) => onChange({ quantity: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Cost</span>
          <Input type="number" inputMode="decimal" required aria-label={`Cost of ${product.name}`}
            min="0" step="0.01" disabled={missing}
            value={arrived.unitCost} onChange={(event) => onChange({ unitCost: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Expiry date</span>
          <Input type="date" min={today()} aria-label={`Expiry date of ${product.name}`} disabled={missing}
            value={arrived.expiryDate} onChange={(event) => onChange({ expiryDate: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Lot</span>
          <Input maxLength={64} autoComplete="off" aria-label={`Lot of ${product.name}`} disabled={missing}
            value={arrived.lotCode} onChange={(event) => onChange({ lotCode: event.target.value })} />
        </label>
      </div>
    </li>
  )
}
