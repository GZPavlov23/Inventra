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
import { formatDay, formatMoney, formatQuantity, lineCents, today } from '@/lib/format'
import { useT } from '@/i18n/language-context'

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
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.deliveries.receiveNumber(delivery?.id ?? '')}</DialogTitle>
          <DialogDescription>
            {t.deliveries.receiveText}
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
  const t = useT()
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
      toast.success(t.deliveries.wasReceived(delivery.id))
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

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-dashed border-foreground/25 pb-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">{t.deliveries.from}</dt>
          <dd className="font-medium">{delivery.supplier.name}</dd>
          <dt className="text-muted-foreground">{t.deliveries.ordered}</dt>
          <dd className="figures">{formatDay(delivery.created_at.slice(0, 10))}</dd>
          {delivery.expected_on && (
            <>
              <dt className="text-muted-foreground">{t.deliveries.expected}</dt>
              <dd className="figures">{formatDay(delivery.expected_on)}</dd>
            </>
          )}
        </dl>
        <div className="w-full sm:w-56">
          <FormField id="invoice_number" label={t.deliveries.invoiceNumber}>
            <Input id="invoice_number" maxLength={64} autoComplete="off" className="figures"
              value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
          </FormField>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-dashed" aria-label={t.deliveries.inThisDelivery}>
        {delivery.items.map((line, index) => (
          <ArrivedRow
            key={line.id}
            number={index + 1}
            line={line}
            arrived={arrived[line.id]}
            onChange={(changes) => updateLine(line.id, changes)}
          />
        ))}
      </ul>

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">{t.deliveries.totalAtPrices}</span>
        <span className="text-lg font-semibold" aria-label={t.deliveries.receivedTotal}>
          {formatMoney(totalCents / 100, currency)}
        </span>
      </div>

      {nothingArrived && (
        <p className="text-sm text-muted-foreground">
          {t.deliveries.nothingArrived}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.deliveries.back}</Button>
        <Button type="submit" disabled={receive.isPending || nothingArrived}>
          {receive.isPending && <Spinner />}
          {t.deliveries.receiveGoods}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ArrivedRow({ number, line, arrived, onChange }: {
  number: number
  line: DeliveryLine
  arrived: ArrivedLine
  onChange: (changes: Partial<ArrivedLine>) => void
}) {
  const { product } = line
  // The browser refuses half a piece before the form is even sent.
  const smallestAmount = product.unit === 'pcs' ? '1' : '0.001'
  const missing = Number(arrived.quantity) === 0
  const t = useT()

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-medium">
          <span className="figures mr-2 text-muted-foreground" aria-hidden>{String(number).padStart(2, '0')}</span>
          {product.name}
        </p>
        <p className="text-xs text-muted-foreground figures">
          {t.deliveries.orderedAmount(formatQuantity(line.ordered_quantity, product.unit))}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[6rem_6rem_1fr_1fr]">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t.deliveries.arrived}</span>
          <Input type="number" inputMode="decimal" required aria-label={t.shared.fieldOf(t.deliveries.arrived, product.name)}
            min="0" step={smallestAmount} max="100000"
            value={arrived.quantity} onChange={(event) => onChange({ quantity: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t.deliveries.cost}</span>
          <Input type="number" inputMode="decimal" required aria-label={t.shared.fieldOf(t.deliveries.cost, product.name)}
            min="0" step="0.01" disabled={missing}
            value={arrived.unitCost} onChange={(event) => onChange({ unitCost: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t.deliveries.expiryDate}</span>
          <Input type="date" min={today()} aria-label={t.shared.fieldOf(t.deliveries.expiryDate, product.name)} disabled={missing}
            value={arrived.expiryDate} onChange={(event) => onChange({ expiryDate: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t.deliveries.lotLabel}</span>
          <Input maxLength={64} autoComplete="off" aria-label={t.shared.fieldOf(t.deliveries.lotLabel, product.name)} disabled={missing}
            value={arrived.lotCode} onChange={(event) => onChange({ lotCode: event.target.value })} />
        </label>
      </div>
    </li>
  )
}
