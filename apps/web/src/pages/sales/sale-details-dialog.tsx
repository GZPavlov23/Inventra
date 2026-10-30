import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDateTime, formatDay, formatMoney, formatQuantity } from '@/lib/format'
import type { Sale, SaleLine } from '@/lib/sales-api'

type SaleDetailsDialogProps = {
  sale?: Sale
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SaleDetailsDialog({ sale, currency, open, onOpenChange }: SaleDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sale #{sale?.id}</DialogTitle>
          <DialogDescription>
            {sale && `${formatDateTime(sale.sold_at)} · ${sale.actor.full_name}`}
          </DialogDescription>
        </DialogHeader>
        {sale && (
          <>
            <ul className="flex flex-col divide-y">
              {sale.items.map((line) => (
                <SaleLineRow key={line.id} line={line} currency={currency} />
              ))}
            </ul>
            <dl className="flex flex-col gap-1 border-t pt-3 text-sm">
              <TotalRow label="Total" value={formatMoney(sale.total, currency)} strong />
              <TotalRow label="Cost of the goods" value={formatMoney(sale.cost, currency)} />
              <TotalRow label="Profit" value={formatMoney(sale.profit, currency)} />
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SaleLineRow({ line, currency }: { line: SaleLine; currency: string }) {
  const { product } = line
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{product.name}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatQuantity(line.quantity, product.unit)} × {formatMoney(line.unit_price, currency)}
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(line.total, currency)}</span>
      </div>
      <ul aria-label={`Batches of ${product.name}`} className="flex flex-col gap-0.5">
        {line.movements.map(({ quantity_delta: delta, batch }) => (
          <li key={batch.id} className="text-xs text-muted-foreground">
            {formatQuantity(-Number(delta), product.unit)} from the batch{' '}
            {batch.expiry_date ? `expiring ${formatDay(batch.expiry_date)}` : 'without an expiry date'}
            {batch.lot_code && `, lot ${batch.lot_code}`}
          </li>
        ))}
      </ul>
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
