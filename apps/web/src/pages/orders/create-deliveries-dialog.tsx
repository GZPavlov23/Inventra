import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
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
import { deliveriesApi } from '@/lib/deliveries-api'
import { formatMoney, lineCents, today } from '@/lib/format'
import type { OrderLine } from '@/lib/forecasts-api'
import type { SupplierRef } from '@/lib/suppliers-api'

type CreateDeliveriesDialogProps = {
  // Only the lines with something to order.
  lines: OrderLine[]
  quantityOf: (line: OrderLine) => string
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateDeliveriesDialog({ open, onOpenChange, ...form }: CreateDeliveriesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create deliveries</DialogTitle>
          <DialogDescription>
            One delivery for each supplier. Stock changes only when the goods arrive.
          </DialogDescription>
        </DialogHeader>
        <DeliveriesForm {...form} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

type SupplierGroup = { supplier: SupplierRef; lines: OrderLine[] }

function groupBySupplier(lines: OrderLine[]): SupplierGroup[] {
  const groups = new Map<number, SupplierGroup>()
  for (const line of lines) {
    if (!line.supplier) continue
    const group = groups.get(line.supplier.id) ?? { supplier: line.supplier, lines: [] }
    group.lines.push(line)
    groups.set(line.supplier.id, group)
  }
  return [...groups.values()]
}

function DeliveriesForm({ lines, quantityOf, currency, onClose, onCreated }: {
  lines: OrderLine[]
  quantityOf: (line: OrderLine) => string
  currency: string
  onClose: () => void
  onCreated: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [expectedOn, setExpectedOn] = useState('')

  const ready = lines.filter((line) => line.supplier?.active)
  const leftOut = lines.filter((line) => !line.supplier?.active)
  const groups = groupBySupplier(ready)
  const costOf = (group: SupplierGroup) =>
    group.lines.reduce((sum, line) => sum + lineCents(quantityOf(line), line.unit_cost), 0)

  const create = useMutation({
    mutationFn: () =>
      deliveriesApi.fromOrder({
        expected_on: expectedOn || null,
        items: ready.map((line) => ({
          product_id: line.product.id,
          quantity: quantityOf(line),
          unit_cost: line.unit_cost,
        })),
      }),
    onSuccess: (deliveries) => {
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      // What is on the way now doesn't need ordering again.
      void queryClient.invalidateQueries({ queryKey: ['sales', 'orders'] })
      toast.success(deliveries.length === 1 ? '1 delivery was created' : `${deliveries.length} deliveries were created`, {
        action: { label: 'View', onClick: () => void navigate('/deliveries') },
      })
      onCreated()
      onClose()
    },
  })

  return (
    <div className="flex flex-col gap-4">
      {create.error && (
        <Alert variant="destructive">
          <AlertDescription>{toApiError(create.error).message}</AlertDescription>
        </Alert>
      )}

      {groups.length > 0 && (
        <ul className="flex flex-col divide-y" aria-label="Deliveries to create">
          {groups.map((group) => (
            <li key={group.supplier.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{group.supplier.name}</p>
                <p className="text-sm text-muted-foreground">
                  {group.lines.map((line) => line.product.name).join(', ')}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatMoney(costOf(group) / 100, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {leftOut.length > 0 && (
        <p className="text-sm text-amber-900" role="status">
          Left out, without an active supplier: {leftOut.map((line) => line.product.name).join(', ')}.
          Set a supplier on the Products page to include them.
        </p>
      )}

      {groups.length > 0 && (
        <FormField id="order_expected_on" label="Expected on">
          <Input id="order_expected_on" type="date" min={today()}
            value={expectedOn} onChange={(event) => setExpectedOn(event.target.value)} />
        </FormField>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={create.isPending || groups.length === 0} onClick={() => create.mutate()}>
          {create.isPending && <Spinner />}
          {groups.length === 1 ? 'Create 1 delivery' : `Create ${groups.length} deliveries`}
        </Button>
      </DialogFooter>
    </div>
  )
}
