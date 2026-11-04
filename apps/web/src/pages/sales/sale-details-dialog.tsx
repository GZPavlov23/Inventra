import { useCurrentUser } from '@/auth/use-auth'
import { DetailsPanel } from '@/components/details-panel'
import { formatDateTime, formatDay, formatMoney, formatQuantity } from '@/lib/format'
import type { Sale, SaleLine } from '@/lib/sales-api'

type SaleDetailsDialogProps = {
  sale?: Sale
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Laid out like the till receipt the customer took home, so it reads at a glance.
export function SaleDetailsDialog({ sale, currency, open, onOpenChange }: SaleDetailsDialogProps) {
  const { store } = useCurrentUser()
  return (
    <DetailsPanel
      open={open}
      onOpenChange={onOpenChange}
      hideHeader
      title={`Sale #${sale?.id}`}
      description={sale && `${formatDateTime(sale.sold_at)} · ${sale.actor.full_name}`}
    >
      {sale && (
        <div className="torn-edges mt-6 bg-paper px-5 py-7 text-sm">
          <div className="flex flex-col items-center gap-0.5 text-center">
            <p className="font-semibold">{store.name}</p>
            <p className="figures text-xs text-muted-foreground">
              Sale #{sale.id} · {formatDateTime(sale.sold_at)}
            </p>
            <p className="text-xs text-muted-foreground">{sale.actor.full_name}</p>
          </div>
          <ul className="mt-4 flex flex-col gap-3 border-y border-dashed border-foreground/25 py-4">
            {sale.items.map((line) => (
              <SaleLineRow key={line.id} line={line} currency={currency} />
            ))}
          </ul>
          <dl className="flex flex-col gap-1 pt-3">
            <TotalRow label="Total" value={formatMoney(sale.total, currency)} strong />
            <TotalRow label="Cost of the goods" value={formatMoney(sale.cost, currency)} />
            <TotalRow label="Profit" value={formatMoney(sale.profit, currency)} />
          </dl>
        </div>
      )}
    </DetailsPanel>
  )
}

function SaleLineRow({ line, currency }: { line: SaleLine; currency: string }) {
  const { product } = line
  return (
    <li className="flex flex-col gap-0.5">
      <p className="font-medium">{product.name}</p>
      <div className="figures flex justify-between gap-4">
        <span className="text-muted-foreground">
          {formatQuantity(line.quantity, product.unit)} × {formatMoney(line.unit_price, currency)}
        </span>
        <span className="font-medium">{formatMoney(line.total, currency)}</span>
      </div>
      <ul aria-label={`Batches of ${product.name}`} className="flex flex-col">
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
    <div className={`flex justify-between gap-4 ${strong ? 'text-base font-semibold' : 'text-muted-foreground'}`}>
      <dt>{label}</dt>
      <dd className="figures">{value}</dd>
    </div>
  )
}
