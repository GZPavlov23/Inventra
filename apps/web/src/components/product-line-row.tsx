import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney, lineCents } from '@/lib/format'
import type { Product } from '@/lib/products-api'

export type ProductLine = {
  product: Product
  quantity: string
  unitPrice: string
}

// One product of a sale or an order: how much, at what price, and what that comes to.
export function ProductLineRow({ line, priceLabel, currency, onChange, onRemove }: {
  line: ProductLine
  priceLabel: string
  currency: string
  onChange: (changes: Partial<ProductLine>) => void
  onRemove: () => void
}) {
  const { product, quantity, unitPrice } = line
  // The browser refuses half a piece before the form is even sent.
  const smallestAmount = product.unit === 'pcs' ? '1' : '0.001'

  return (
    <li className="grid grid-cols-[1fr_auto] items-end gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[1fr_6rem_6rem_5rem_auto]">
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:self-center">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="text-xs text-muted-foreground">{product.unit}</p>
      </div>
      <div className="col-span-2 grid grid-cols-[1fr_1fr_5rem_auto] items-end gap-3 sm:contents">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Quantity</span>
          <Input type="number" inputMode="decimal" required aria-label={`Quantity of ${product.name}`}
            min={smallestAmount} step={smallestAmount} max="100000"
            value={quantity} onChange={(event) => onChange({ quantity: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{priceLabel}</span>
          <Input type="number" inputMode="decimal" required aria-label={`${priceLabel} of ${product.name}`}
            min="0" step="0.01"
            value={unitPrice} onChange={(event) => onChange({ unitPrice: event.target.value })} />
        </label>
        <span className="flex h-8 items-center justify-end text-sm font-medium tabular-nums">
          {formatMoney(lineCents(quantity, unitPrice) / 100, currency)}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${product.name}`} onClick={onRemove}>
          <X />
        </Button>
      </div>
    </li>
  )
}
